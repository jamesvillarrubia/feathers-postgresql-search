// Initializes the `books` service on path `/books`
import { ServiceAddons } from '@feathersjs/feathers';
import { Application } from '../../declarations';
import { Books } from './books.class';
import createModel from '../../models/books.model';
import hooks from './books.hooks';

// Add this service to the service type index
declare module '../../declarations' {
  interface ServiceTypes {
    'books': Books & ServiceAddons<any>;
  }
}

export default function (app: Application): void {
  const options = {
    Model: createModel(app),
    paginate: app.get('paginate')
  };

  // Initialize our service with any options it requires
  app.use('/books', 
    (req:any,res:any,next:any)=>{console.log('middleware');next();},
    new Books(options, app)
  );

  // Get our initialized service so that we can register hooks
  const service = app.service('books');

  service.hooks(hooks);
}
