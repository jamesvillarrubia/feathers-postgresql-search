# feathers-postgresql-search


## Why this?

Throughout my 15 years as web developer, I have built countless services with less than ideal search options  In the early days of Wordpress and Drupal, we used LIKE statements and mashed together strings. And while tools like Mongo have some search capabilties, ranked search results were still hard to deploy.  As the web (and my skills) grew, we offloaded ranked search to tools like Solr and Elastic.  But each of these solutions requires an independent service - new servers, new stateful storage, new costs.  Finally, search as a service was exposed with wonderful companies like Algolia, MeiliSearch, and Bonsai.  Each of these platforms has tradeoffs.  While they avoid some maintenance costs, they also required that your data leave your systems.  They correllate costs on data and not simply usage because they are "double-hosting" data in your stack.  Eventually these tools can become quite pricey, particularly if you just want simple ranked search.

So... what if our data is more complex than a simple LIKE mashing can deal with, but our service is not so complex that it requires a distinct service (managed or deployed)?

PostgreSQL search to the rescue!

PostgreSQL offer a variety of innate search functionalities that can cover that gap between LIKE and Elastic.  Many, many articles have talked about setting up these queries or materialized views.  But very few offer examples on how to deploy those capabilities in a true service.

That's what we're doing in this series.



# PART 1 - We build a RESTful service
## Tooling Opinions

In the corporate transition from on-prem to cloud and microservice architectures, three recurring patterns have emerged. First, "I/O wait" is everywhere.  This is why Node and Go have grown so quickly, while Ruby and PHP have tapered.  Even if I/O wait wasn't such an issue, so much investment has been made in Node that it is now faster than many multi threaded alternatives, even with CPU-bound actions like encryption.  Second, RESTful patterns are all 90% the same.  Rarely is HATEOAS implemented, but almost everything else is. And thirdly, databases shouldn't matter to the REST endpoint.  I'm giving and getting JSON.  I shouldn't care how it's stored.  That's for the architect to decide based on query and access patterns.  The DB shouldn't be dictated by the service's logic.  

For these three reasons, I fell in love with a NodeJS framework called [FeathersJS](https://feathersjs.com/).  It is a lightweight framework on top of ExpressJS that provides a universal data model across multiple DB backends, repeatable and reusable REST patterns, and almost no additional overhead from Express.  Unlike frameworks like Sails or Nest, Feathers services operate with microservice REST as a default pattern, eschewing the cruft of typical MVC and replacing it with predictable middleware chains - _"Did it come in correctly?  Do we manipulate it before the DB?  Great the DB sent us something back, do we manipulate it now?"_.  Most importantly, Feathers makes it _hard_ to overcomplicate your code with implicit pattersn, decorators, and overly-coupled inheritance.

For this tutorial, we're going to use FeathersJS for our core library.  We'll also dabble a bit in Sequelize and KnexJS.

## Search in your Service

There are two major ways to deploy search internally that this tutorial will cover.  
1. _Add a simple search vector to a single table._ Enable better search on a single table by combining multiple fields into a searchable text vector.
2. _Add a complex search vector that combines multiple tables._  Enable better search on a complex set of JOINs by leveraging an auto-updating materialized view and search vector.

This tutorial will start with the first option.

## Getting Started with Feathers

1. Make sure you have [NodeJS](https://nodejs.org/) and [npm](https://www.npmjs.com/) installed.
2. Install your dependencies

    ```shell
    npm install @feathersjs/cli -g
    mkdir your-app
    cd your-app
    feathers generate app
    ```

3. Select the following

    ```markdown
    ? Do you want to use JavaScript or TypeScript? _TypeScript_
    ? Project name _search-test_
    ? Description _Testing Search in Postgres_
    ? What folder should the source files live in? _src_
    ? Which package manager are you using (has to be installed globally)? _npm_
    ? What type of API are you making? _REST_
    ? Which testing framework do you prefer? _Mocha + assert_
    ? This app uses authentication _No_
    ```

4. Start your app

    ```shell
    npm start
    ```

    What you you should see at this point is:

    ```shell
    info: Feathers application started on http://localhost:3030
    ```

    And if you go to http://localhost:3030, you'll see the feathers logo

## Adding a test service

1. Add the books service

    ```shell
    feathers generate service
    ```

    NOTE: What we've asked feathers to here is to create a "service." Feathers defines services as objects/classes that implement methods and usually map to a particular RESTful entity and a particular DB table or collection.  Service methods are pre-defined CRUD methods.  This is what gives Feathers it's power - universal CRUD across all DB types or custom data sources.  

2. Select the following

    ```markdown
    ? What kind of service is it? _Sequelize_
    ? What is the name of the service? _books_
    ? Which path should the service be registered on? _/books_
    ? Which database are you connecting to? _PostgreSQL_
    ? What is the database connection string? _postgres://postgres:@localhost:5432/feathers\_postgresql\_search_
    ```

## Adding fields to our Service

1. Open the `/src/models/books.model.ts` and modify it as such. 
    First pull out the Books Model object as:

    ```javascript
    export const BooksModel = {
        title: {
            type: DataTypes.STRING,
        },
        author: {
            type: DataTypes.STRING,
        },
        description: {
            type: DataTypes.TEXT,
        },
        isbn: {
            type: DataTypes.TEXT,
        }
        published: {
            type: DataTypes.DATEONLY 
        }
    }
    const books = sequelizeClient.define('books', BooksModel,...)
    ```

    Now we can access the schema from other files.

2. Add a search vector field.  
    This is where we add a singular column in our eventual DB table that will provide the vector and index for our search.

    ```javascript
    export const BooksModel = {
        // ...
        search_vector: {
            type: 'tsvector'
        }
    }
    ```

    This will create a TSVECTOR column in your Postgres DB.  Note that the type in this column appears as a string.  This is because Sequelize, while supporting tsvectors, doesn't provide the TypeScript types for it just yet.

## Adding a DB

1. Make sure your Postgres connection is correct in `/config/default.json`

    1. If you want to run Postgres locally via Docker, add the following to a `docker-compose.yml`

        ```yml
        version: '3.8'

        services:

        # # This is the postgres docker DB available at port 35432
        # #   - This only for local usage and has no bearing on CloudSQL
        # #   - When referencing the db from a compose container, use database:5432
        database:
            image: "postgres:10.16"
            environment:
            - POSTGRES_USER=unicorn_user
            - POSTGRES_PASSWORD=magical_password
            - POSTGRES_DB=rainbow_database
            volumes:
            - database-data:/var/lib/postgresql/data/
            ports:
            - "5432:5432"

        volumes:
        database-data:

        ```

    2. From your terminal, run `docker-compose up --force-recreate --build` and you'll get a fresh feathers app and postgres DB every time.
    3. If using the docker container, then the connection string will be something like `postgres://unicorn_user:magical_password@localhost:5432/rainbow_database`

2. Confirm the system will boot by running `npm start` or `npm run dev` in a new tab (after starting Docker or Postgres).

    If your system is running correctly, you should see `info: Feathers application started on http://localhost:3030`.

    If your DB connection is up, you can hit `http://localhost:3030/books` and see the following json:

    ```json
    {"total":0,"limit":10,"skip":0,"data":[]}
    ```

## Confirm your DB Structure

Feathers Sequelize will automatically sync the DB structure to a new table on boot.  But we can confirm that our fields are there with a simple curl request against our REST API.  

```shell
curl --location --request POST 'http://localhost:3030/books' \
--header 'Content-Type: application/json' \
--data-raw '{
    "title":"How I Built My House",
    "author":"Bob Vila",
    "description": "This book is a great book about building houses and family homes.",
    "isbn": "12345678",
    "published": "2021-12-15T20:28:03.578Z"
}'
```

If you hit `http://localhost:3030/books` again, it should display the following json:

```json
{"total":1,"limit":10,"skip":0,"data":[{"id":1,"title":"How I Built My House","author":"Bob Vila","description":"This book is a great book about building houses and family homes.","isbn":"12345678","published":"2021-12-15","search_vector":null,"createdAt":"2022-01-07T03:41:58.933Z","updatedAt":"2022-01-07T03:41:58.933Z"}]}
```

If you have an error in the early steps, and a field is missing, try deleting the whole table and letting Feathers rebuild from scratch.

## Creating the search vector

As mentioned, there are many articles outlining the particulars of creating a Postgres tsvector for ranked search.  See [here](https://www.compose.com/articles/mastering-postgresql-tools-full-text-search-and-phrase-search/), here, and here for examples.  What we want to do is run an `UPDATE` statement after the modification of any given row in our `/books` service.  That means any POST, PUT, or PATCH should rebuild the vector for that row.  Sequelize does offer transaction hooks, but they can be tricky with batch writes.  In the feathers context, it is best to build a trigger in SQL directly, or leave the logic to a Feathers `hook`.  Sequelize is an ugly middleground that tightly couples our search to the ORM and not to the API or to the DB table.  

Postgres triggers are more complicated, so we will use a Feathers `hook`.  Hooks are specific, asynchronous, middleware functions that are mapped to each Express method and path.  For example, in `/src/services/books/books.hooks.ts` you could add the following:

    ```javascript
        before: {
            ...
            find: [(context)=>console.log('This is the /books context object:', context)],
            ...
        }
    ```

For every find request (i.e. GET request to `/books/{id}` where id is null or empty), we will trigger the hook function that passes the feathers context (a modified Express Request object) and log it to the console.  Because it's in the `before` array, it will trigger before the middleware calls Sequelize and hits the DB.  Before hooks are great for modify data to fit a DB schema or authenticating headers and users.  After hooks are great for removing extraneous or sensitive fields from the outgoing response.


Here's our hook, which you can place in a `src/services/books/tsquery-and-search.hook.ts`

    ```javascript
    import { HookContext } from '@feathersjs/feathers';
    import { GeneralError } from '@feathersjs/errors';

    export const updateTheTSVector = (options:any) => async (ctx:HookContext)=>{
        // prevent a developer from using this hook without a named column to search
        if(!options.searchColumn) throw new GeneralError('TSVector hook cannot function without a searchColumn parameter.')

        // gets the shared sequelize client
        const sequelize = ctx.app.get('sequelizeClient');
        const id = ctx.result.id;
        // creates a list of all of the fields we want to search based on the inclusion of a "level" field in our Model.  
        // ts_rank allows us to set importance on four levels: A > B > C > D.
        const fieldList = Object.keys(options.model).filter(k=>(options.model as any)[k].level && ['A','B','C','D'].includes((options.model as any)[k].level));
        // Our query is an update statement that maps each appropriate field to a vector and then merges all the vectors for storage
        const query = `
            UPDATE "${ctx.path}" SET "${options.searchColumn}" = (`+
            fieldList.map((v,i)=>{
                return `setweight(to_tsvector($${i+1}), '${(options.model as any)[v].level}')`;
            }).join(' || ')
            +`) WHERE "id"=${id} RETURNING ${options.searchColumn};
            `;
        
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
    ```
And we will add it to the following after hooks in the `books.hooks.ts` file:

    ```javascript
    // add the Model so we can reference it in the hook
    import { BooksModel  } from '../../models/books.model';
    
    after: {
        all: [],
        find: [],
        get: [],
        create: [updateTheTSVector({model:BooksModel, searchColumn:'search_vector'})],
        update: [updateTheTSVector({model:BooksModel, searchColumn:'search_vector'})],
        patch: [updateTheTSVector({model:BooksModel, searchColumn:'search_vector'})],
        remove: []
    }
    ```
NOTE: we've given ourselves a hook options `searchColumn` which allows us to reuse this hook elsewhere and we reference the Model directly, so nothing about the hook is `books`-specific.
## Testing the Vector Creation Hook

Let's give our hook a spin.  First we need to add the ranking fields to the Model object.  Here's an example:

```javascript
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
```

That means that the relative strength for ranking results looks at `title > description > author`. `level` is not an official sequelize field parameter, but we use it in our hook to determine which fields to include in our vector and which to ignore.

Now let's run that curl again:

```shell
curl --location --request POST 'http://localhost:3030/books' --header 'Co application/json' --data-raw '{
    "title":"How I Built My House",
    "author":"Bob Vila",
    "description": "This book is a great book about building houses and family homes.",
    "isbn": "12345678",
    "published": "2021-12-15T20:28:03.578Z"
}'
```

You can now see that the most recent row has the following vector: `'bob':6C 'book':9B,13B 'build':15B 'built':3A 'famili':18B 'great':12B 'home':19B 'hous':5A,16B 'vila':7C`

Congrats, we are now automatically updating our search vector!  You can confirm it with PUT and PATCH request as well. 


In the next article, we will add the ability to leverage this vector from an HTTP request.









# Exposing the field to search

If you are finding this article first, make sure to check out the previous tutorial on setting up a search vector [here]().

This tutorial is part 2 of our series in adding Postgres search to RESTful API without bruteforce LIKE statements or external tooling.  The previous article covered adding a search vector to our DB.  But adding a search vector doesn't do much unless we enable search on it as a consumer of the API.  Because of the way Sequelize creates queries, this can get a littl tricky.  We're going to solve that through a new hook.
## Adding better data

If you fiddled with the last article, you probably seeded your DB with lots of test requests and simple book objects.  Let's add some better data for our testing scenarios.  Delete any remaining rows from your Postgres DB or drop the table and restart feathers.

Now, run the following three curl requests:

```shell

curl --location --request POST 'http://localhost:3030/books' \
--header 'Content-Type: application/json' \
--data-raw '
    {
        "title":"Space: A Novel",
        "author":"James A. Michener ",
        "description": "Already a renowned chronicler of the epic events of world history, James A. Michener tackles the most ambitious subject of his career: space, the last great frontier. This astounding novel brings to life the dreams and daring of countless men and women - people like Stanley Mott, the engineer whose irrepressible drive for knowledge places him at the center of the American exploration effort; Norman Grant, the war hero and US senator who takes his personal battle not only to a nation but to the heavens; Dieter Kolff, a German rocket scientist who once worked for the Nazis; Randy Claggett, the astronaut who meets his destiny on a mission to the far side of the moon; and Cynthia Rhee, the reporter whose determined crusade brings their story to a breathless world.",
        "isbn": "0812986768",
        "published": "2015-07-07T00:00:00.000Z"
    }';

curl --location --request POST 'http://localhost:3030/books' \
--header 'Content-Type: application/json' \
--data-raw '
    {
        "title":"A Concise History of the Netherlands",
        "author":"James Kennedy",
        "description": "The Netherlands is known among foreigners today for its cheese and its windmills, its Golden Age paintings and its experimentation in social policies such as cannabis and euthanasia. Yet the historical background for any of these quintessentially Dutch achievements is often unfamiliar to outsiders. This Concise History offers an overview of this surprisingly little-known but fascinating country. Beginning with the first humanoid settlers, the book follows the most important contours of Dutch history, from Roman times through to the Habsburgs, the Dutch Republic and the Golden Age. The author, a modernist, pays particularly close attention to recent developments, including the signature features of contemporary Dutch society. In addition to being a political history, this overview also gives systematic attention to social and economic developments, as well as in religion, the arts and the Dutch struggle against the water. The Dutch Caribbean is also included in the narrative.",
        "isbn": "0521875889",
        "published": "2017-08-24T00:00:00.000Z"
    }';

curl --location --request POST 'http://localhost:3030/books' \
--header 'Content-Type: application/json' \
--data-raw '
    {
        "title":"Exploring Kennedy Space Center (Travel America'\''s Landmarks)",
        "author":"Emma Huddleston",
        "description": "Gives readers a close-up look at the history and importance of Kennedy Space Center. With colorful spreads featuring fun facts, sidebars, a labeled map, and a Thats Amazing! special feature, this book provides an engaging overview of this amazing landmark.",
        "isbn": "1641858540",
        "published": "2019-08-01T00:00:00.000Z"
    }';
```

This will add 3 real books to our database.  We will search for all three in a variety of ways to validate our new search capability.  If you open up the DB, you can see that the search_vector column has significantly larger vectors to work with.  For Emma Huddleston's book, we get `'amaz':40B,51B 'america':6A 'book':44B 'center':4A,26B 'close':15B 'close-up':14B 'color':28B 'emma':9C 'engag':47B 'explor':1A 'fact':32B 'featur':30B,42B 'fun':31B 'give':11B 'histori':20B 'huddleston':10C 'import':22B 'kennedi':2A,24B 'label':35B 'landmark':8A,52B 'look':17B 'map':36B 'overview':48B 'provid':45B 'reader':12B 'sidebar':33B 'space':3A,25B 'special':41B 'spread':29B 'that':39B 'travel':5A`.


## Whitelisting our query parameter

Feathers will disallow certain query parameters that aren't whitelisted and aren't fields in the service's model.  We want to be able to filter with normal matching like `publication > 2018` and also filter by search keywords `!Johnson & Kennedy & (space | history)` which is equivalent to `-Johnson and Kennedy and ( space or history )` if you prefer search words.  This is close to google's syntax but not exact.  

To do that our eventual REST query would look like `http://localhost:3030/books?published[$gt]=2016`

If you hit that query, you should only see 2 results, excluding `Space: A Novel`.  This is the power of Feathers' default CRUD operations and query translation.  

But we want to add a new query option, `$search`, making our query `http://localhost:3030/books?published[$gt]=2016&$search=!Johnson & Kennedy & (space | history)`.  But remember that urls don't like spaces and parentheses, so let's urlencode it to `%21Johnson%26Kennedy%26%28space%7Chistory%29`.

Now our search request looks like: `http://localhost:3030/books?published[$gt]=2016&$search=%21Johnson%26Kennedy%26%28space%7Chistory%29`.  

If you hit that endpoint now, you'll see `Invalid query parameter $search`.  To fix this, go to `src/services/books/books.service.ts` and add the `whitelist` array like so:

```javascript
  const options = {
    Model: createModel(app),
    paginate: app.get('paginate'),
    whitelist: ['$search']
  };
```

Now try again!  You should see `column books.$search does not exist`.  That's good... that means our $search parameter is allowed through and we can clean it up in our hook.

## Creating our hook

Because the only verb and path combination that we want to support $search on is `FIND`, that's where our hooks going to go.  And because it's only a `before` hook, put the following in your `books.hooks.ts` file:

```javascript
    export default {
        before:{
            //...
            find: [ modifyQueryForSearch({searchColumn:'search_vector'}),
            //...
        }
```

Note that we are using the same `searchColumn` name as before.  

But that function doesn't exist.  Let's add the import and placeholder now:

```javascript
    // books.hooks.ts
    import { modifyQueryForSearch, updateTheTSVector } from './tsquery-and-search.hook';
```

```javascript
    // tsquery-and-search.hook.ts
    export const modifyQueryForSearch = (options:any) => async(ctx:HookContext)=>{}
```

Now we have a hook that does nothing, but is in the right place.

## Cleaning up the Search parameter

Because our DB doesn't have a column called `$search`, we want to remove that parameter and store it for later.  Add the following to the function:

```javascript
    export const modifyQueryForSearch = (options:any) => async(ctx:HookContext)=>{
        const params = ctx.params;
        
        // NOTE: make sure to add whitelist: ['$search'] to the service options.
        const search = params?.query?.$search;
        
        // early exit if $search isn't a queryparameter so we can use normal sort and filter.
        if(!search) return ctx;
        
        // removes that parameter so we don't interfere with normal querying
        delete ctx.params?.query?.$search;
    }
```

Great, now if we hit `http://localhost:3030/books?published[$gt]=2016&$search=%21Johnson%26Kennedy%26%28space%7Chistory%29` again we should see our 2 results again.  Search isn't working, but it isn't breaking the request.  

## Overriding Feathers-Sequelize

Feathers-sequelize typically takes our `params.query` and converts it into a sequelize friendly structure.  We want to modify that structure so our `WHERE` statement includes our search parameters.  If you examine the `_find` function in `node_modules/feathers-sequelize/lib/index.js` you can see what it's doing.

```javascript
    _find (params = {}) {
        const { filters, query: where, paginate } = this.filterQuery(params);
        const order = utils.getOrder(filters.$sort);

        const q = Object.assign({
            where,
            order,
            limit: filters.$limit,
            offset: filters.$skip,
            raw: this.raw,
            distinct: true
        }, params.sequelize);

        if (filters.$select) {
        q.attributes = filters.$select;
        }
        // etc
```
As you can see, we can override the `where` options with `params.sequelize`, but it is not a deep-merge.  That's not helpful.  But since we know how the `where` object is formed, we can replicate it wholesale!  Modify the hook as so:

```javascript
    export const modifyQueryForSearch = (options:any) => async(ctx:HookContext)=>{
        
        //... params stuff

        // build the where overrides ourselves
        // this replicates how the _find function in Feathers-Sequelize works, so we can override because we can't merge the 'where' statements
        const {query: where} = ctx.app.service(ctx.path).filterQuery(params);
        
        // pass them into the sequelize parameter, which overrides Feathers, but we account for defaults above
        params.sequelize = { 
            where:{
                ...where,
                //... MODIFIACTIONS GO HERE
            },
```

If you run the query request again, the results should be the same.  

So what do we add to the `where` object?  To get our filter, we want to add an additional criteria. Our eventual SQL statement needs to look like:
`SELECT * FROM "books" AS "books" WHERE (books.search_vector @@ to_tsquery("!Johnson&Kennedy&(space|history)")) AND "books"."published" > '2016-01-01'`;

 So let's start with the Sequelize `Op.and`:

```javascript
    where:{
        ...where,
        [Op.and]: //... MODIFIACTIONS GO HERE
    },
```

Now we know we have a `to_tsquery` function with an input, so let's make that:

```javascript
    where:{
        ...where,
        [Op.and]: Sequelize.fn( `books.search_vector @@ to_tsquery`,'!Johnson&Kennedy&(space|history)')
      )//... MODIFIACTIONS GO HERE
    },
```

Obviously we don't want to hardcode the query, so let's pull that out as a replacement.  Sequelize requires that we reference it as a literal so it doesn't get parsed incorrectly.

```javascript
    params.sequelize = { 
        where:{
            ...where,
            [Op.and]: Sequelize.fn( `books.search_vector @@ to_tsquery`, Sequelize.literal(':query'))
        },
        // replaces the string query from the parameters with a postgres safe string
        replacements: { query: '!Johnson&Kennedy&(space|history)' }
    }
```

But we also don't want this hook to be hardcoded to `books` or `search_vector`.  Let's replace those:

```javascript
    params.sequelize = { 
        where:{
            ...where,
            [Op.and]: Sequelize.fn(
                `${ctx.path}.${options.searchColumn} @@ to_tsquery`,
                Sequelize.literal(':query')
            )
        },
        // replaces the string query from the parameters with a postgres safe string
        replacements: { query: '!Johnson&Kennedy&(space|history)' },
    }
```

Now let's deal with the query string.  Obviously we don't want to hardcode it, but we also don't want to expect the user to be perfect with their search query.  Thankfully there is an npm plugin that converts more typical search statements in to Postgres tsquery statements.  From your terminal, run `npm i --save pg-tsquery`;

Import the library with `import queryConverter from 'pg-tsquery';` at the top of the file.  

Because we want to give optionality to the converter's settings, we can make that a hook option.  Modify your hook to the following:

```javascript

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
        const {query: where} = ctx.app.service(ctx.path).filterQuery(params);
        
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
            replacements: { query: queryConverter(options.conversionOptions)(search) },
        }
    };
```

You can test this by hitting a different query: `http://localhost:3030/books?published[$gt]=2016&$search=Dutch` which should only return one book because only one book description references the Dutch.

## Adding a rank

Search filtering on ts_vector is still very powerful, but we want to be able to rank our results in a repeatable fashion.  To do that, we need two things: a column computing the rank and an `ORDER BY` statement in our SQL.  

Our end SQL should be something like: 
```sql
    SELECT *, ts_rank(books.search_vector, to_tsquery('!Johnson&Kennedy&(space|history)')) AS "rank" FROM "books" AS "books" WHERE (books.search_vector @@ to_tsquery('!Johnson&Kennedy&(space|history)')) AND "books"."published" > '2016-01-01' ORDER BY rank DESC;
```

To get that additional `ts_rank` column we need another Sequelize parameter: `attributes`.  Attributes are the columns that get selected by Sequelize for return.  By default, all the fields are included.  

Add the following logic to your hook:
```javascript

  params.sequelize = {
    //... from above example
  }

  //only bother with this if $select is used and has rank or no select at all (so rank is included by default)
  const selected = filters.$select;
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
```

Just like the rank modification, we are now modifying the `attribute` field of `params.sequelize`, telling Feathers to acknowlege any `$select` options used as well as adding `$rank` if need be.  `rank` is also added as a default field if there are no `$select` options.

If you hit `http://localhost:3030/books?published[$gt]=2016&$search=%21Johnson%26Kennedy%26%28space%7Chistory%29&$select[0]=id&$select[1]=title&$select[2]=rank` you can see that we can select fields including rank.  

## Sorting by rank

Now that we have a rank column that doesn't interfere with our `$select` options, we need to be able to sort by rank if we want.  In Feathers, the `$sort` parameter is used to designate `DESC` and `ASC` by columns.  For example `?$sort[rank]=1` will sort by ascending rank (least related).  Whereas `$sort[rank][]=-1&$sort[title][]=1` will sort by rank, and if the ranks are the same, then alphabetically by title.

Obviously, since our rank column is an injected column, it isn't automatically added to our $sort options.  Let's fix that now.  Inside the `if(selected && selected.includes('rank') || !selected){` if statement, but below `: {include: [rankFunc]};` add the following code:

```javascript
  if(selected && selected.includes('rank') || !selected){

    //... the column selection stuff from above



    // ************* 
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
    // ************* 

  }

```

What you can see is that the logic is very similar for the `order` parameter of sequelize as for the `attributes`.  Instead of an array of strings, order is an array of arrays like `[ [ 'rank', 'DESC' ], ['title', 'ASC'] ]`.  And we only want to use the order when the rank column exists, otherwise it'll throw an error.


Now that the code is running, hit `http://localhost:3030/books?published[$gt]=2016&$search=%21Johnson%26Kennedy%26%28space%7Chistory%29&$select[0]=id&$select[1]=title&$select[2]=rank&$sort[rank][]=1&$sort[title][]=-1`

And you should see:

```json
{
    "total": 2,
    "limit": 10,
    "skip": 0,
    "data": [
        {
            "id": 2,
            "title": "A Concise History of the Netherlands",
            "rank": 0.409156
        },
        {
            "id": 3,
            "title": "Exploring Kennedy Space Center (Travel America's Landmarks)",
            "rank": 0.997993
        }
    ]
}
```

We now have a functioning hook so we can search, sort, select against our `search_vector` column!

Congrats!