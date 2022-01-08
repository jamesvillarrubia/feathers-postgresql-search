// See https://sequelize.org/master/manual/model-basics.html
// for more of what you can do here.
import { Sequelize, DataTypes, Model } from 'sequelize';
import { Application } from '../declarations';
import { HookReturn } from 'sequelize/types/lib/hooks';
// import * as Postgres from 'sequelize/lib/data-types';

// const TSVECTOR = 


function buildVector(fields:any, Model:any){
  const result = Object.keys(Model).reduce(
    ( acc:string[], curr:string ):any=>{
      if(Model[curr].level){
        acc.push(`setweight(to_tsvector($${fields.indexOf(curr)}::${Model[curr].type}),'${Model[curr].level || 'D'}')`);
      }
      return acc;
    },[]
  ).join(' || ');
  console.log(result);
  return Sequelize.literal(result);
}

function buildUpdateVector(fields:string[], Model:any){
  const result = fields.reduce(
    ( acc:string[], curr:string ):any=>{
      if(Model[curr].level){
        // THIS NEEDS TO BE ESCAPED
        acc.push(`setweight(to_tsvector($${fields.indexOf(curr)}),'${Model[curr].level || 'D'}')`);
      }
      return acc;
    },[]
  ).join(' || ');
  console.log(result);
  return Sequelize.literal(result);
}

export const BooksModel = {
  title: {
    type: DataTypes.STRING,
    level: 'A'
  },
  author: {
    type: DataTypes.STRING,
    level: 'C'
  },
  description: {
    type: DataTypes.TEXT,
    level: 'B'
  },
  isbn: {
    type: DataTypes.TEXT,
  },
  published: {
    type: DataTypes.DATEONLY,
  },
  search_vector: {
    type: 'tsvector'
  }
};

export default function (app: Application): typeof Model {
  const sequelizeClient: Sequelize = app.get('sequelizeClient');

  const books = sequelizeClient.define('books', BooksModel, {
    hooks: {
      beforeCount(options: any): HookReturn {
        // console.log('whattttttt');
        options.raw = true;
      },
      beforeCreate(books:any, options:any): HookReturn {
        // console.log('BeforeCreate');
        // books.search_vector = buildVector(options.fields, BooksModel);
      },
      beforeSave():HookReturn{
        // console.log('\n\n\nbefore Save');
      },
      beforeUpdate(books:any, options:any): HookReturn {
        // console.log('\n\n\n\n');
        // const prior = books._previousDataValues;
        // const values = books.dataValues;
        // const attributeList = books._options.attributes;

        // //append all of the fields that are included in the search so that they are parameterized
        // attributeList.forEach((att:string)=>((BooksModel as any)[att]||{}).level ? books._changed.add(att):null);
        // console.log(books._changed);
        // books.search_vector = buildUpdateVector(books._changed, BooksModel);
      }
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (books as any).associate = function (models: any): void {
    // Define associations here
    // See https://sequelize.org/master/manual/assocs.html
  };

  return books;
}
