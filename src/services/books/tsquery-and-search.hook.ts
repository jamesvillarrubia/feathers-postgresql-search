import { HookContext } from '@feathersjs/feathers';
import { QueryTypes, Sequelize, Op } from 'sequelize';
import queryConverter from 'pg-tsquery';
import { GeneralError } from '@feathersjs/errors';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const utils = require('feathers-sequelize/lib/utils.js');

export const updateTheTSVector = (options:any) => async (ctx:HookContext)=>{
  // prevent a developer from using this hook without a named column to search
  if(!options.searchColumn) throw new GeneralError('TSVector hook cannot function without a searchColumn parameter.');

  // gets the shared sequelize client
  const sequelize = ctx.app.get('sequelizeClient');
  const id = ctx.result.id;
  // creates a list of all of the fields we want to search based on the inclusion of a "level" field in our Model.  
  // ts_rank allows us to set importance on four levels: A > B > C > D.
  const fieldList = Object.keys(options.model).filter(k=>(options.model as any)[k].level && ['A','B','C','D'].includes((options.model as any)[k].level));
  // Our query is an update statement that maps each appropriate field to a vector and then merges all the vectors for storage
  const { tableAttributes } = options.model;
  const fieldList = Object.keys(tableAttributes).filter(
    (field) => tableAttributes[field].level !== undefined
  );

  // const fieldList = [];
  // Our query is an update statement that maps each appropriate field to a vector and then merges all the vectors for storage
  const setLevel = fieldList
    .map(
      (field, idx) =>
        `setweight(to_tsvector($${idx + 1}), '${tableAttributes[field].level}')`
    )
    .join('||');

  const query = `
    UPDATE "${options.model.tableName}" SET "${options.searchColumn}" = (${setLevel})WHERE "id"=${id} RETURNING ${options.searchColumn};`;

        
  // we now await the query update and do a SQL-safe injection through the bind option in sequelize.  This replaces the $1 and $2 etc. in the UPDATE statement with the values from our input data.
  await sequelize.query(query,
    {
      bind: fieldList.map(v=>ctx.result[v]),
      type: QueryTypes.UPDATE
    })
    .then((r:any)=>{
      // because we want see the vector in our result(not normal), we modify the outbound data by appending the updated search_vector field.
      // set the result to the context object so we can share it with the user or hide it
      ctx.result[options.searchColumn] = r[0][0][options.searchColumn];
    })
  // since the data has already been mutated/deleted, we shouldn't throw an error to the end user, but log it for internal tracking
    .catch((e:any)=>console.error(e));
            
  return ctx;
};
  

export const modifyQueryForSearch = (options:any) => async(ctx:HookContext)=>{
  // set defaults
  options = { 
    conversionOptions:{}, 
    searchColumn:'search_vector',
    ...options
  };
  
  const params = ctx.params;
  
  // NOTE: make sure to add whitelist: ['$search'] to the service options.
  const search = params?.query?.$search;
  // early exit if $search isn't a queryparameter so we can use normal sort and filter.
  if(!search) return ctx;
  
  // removes that parameter so we don't interfere with normal querying
  delete ctx.params?.query?.$search;
  
  // build the where overrides ourselves
  // this replicates how the _find function in Feathers-Sequelize works, so we can override because we can't merge the 'where' statements
  const {filters, query: where} = ctx.app.service(ctx.path).filterQuery(params);

  // pass them into the sequelize parameter, which overrides Feathers, but we account for defaults above
  params.sequelize = { 
    where:{
      ...where,
      // adds the search filter so it only includes matching responses
      [Op.and]: Sequelize.fn(
        `${ctx.path}.${options.searchColumn} @@ to_tsquery`,
        Sequelize.literal(':query')
      )
    },
    // replaces the string query from the parameters with a postgres safe string
    replacements: { query: queryConverter(options.conversionOptions)(search) }
  };

  //only bother with this if $select is used and has rank or no select at all (so rank is included by default)
  const selected = filters.$select;
  console.log('selected', selected);
  if(selected && selected.includes('rank') || !selected){
    // remove the select so we can read it later as an attribute array
    delete ctx.params?.query?.$select;
    // then re-add it as a Sequelize column
    const rankFunc = [ Sequelize.fn(
      `ts_rank(${ctx.path}.${options.searchColumn}, to_tsquery`,
      Sequelize.literal(':query)')), 'rank'
    ];
    params.sequelize.attributes = selected
      // if there are selected fields, use the array structure and add our rank column,
      ? [...selected.filter((col:string)=>col!='rank'), rankFunc]
      // if there are no selected fields, use the object structure that defaults to include all and then add our rank column
      : {include: [rankFunc]};



    //only bother with adjusting the sort if rank was used as a column.
    // if no sort exists & rank is added as a column, use rank as default sort as opposed to ID or created_at
    if(!filters.$sort){
      params.sequelize.order = [Sequelize.literal('rank DESC')];
    }else{
      // if there is a $sort present, then convert the rank column to sequelize literal.  This avoids an issue where ORDER by is expecting "books"."rank" instead of just "rank"
      const order = utils.getOrder(filters.$sort);
      params.sequelize.order = order.map((col:string)=>{
        if (col[0] == 'rank'){
          return [Sequelize.literal(`rank ${col[1]}`)];
        }
        return col;
      });
    }

  }
};
  