import { Application as ExpressFeathers } from '@feathersjs/express';

declare module 'sequelize/lib/data-types.js';

// A mapping of service names to types. Will be extended in service files.
export interface ServiceTypes {}
// The application instance type that will be used everywhere else
export type Application = ExpressFeathers<ServiceTypes>;
