import { BooksModel  } from '../../models/books.model';
import { modifyQueryForSearch, updateTheTSVector } from './tsquery-and-search.hook';

export default {
  before: {
    all: [],
    find: [
      modifyQueryForSearch({searchColumn:'search_vector'})
    ],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: []
  },

  after: {
    all: [],
    find: [],
    get: [],
    create: [updateTheTSVector({model:BooksModel,searchColumn:'search_vector'})],
    update: [updateTheTSVector({model:BooksModel,searchColumn:'search_vector'})],
    patch: [updateTheTSVector({model:BooksModel,searchColumn:'search_vector'})],
    remove: []
  },

  error: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: []
  }
};
