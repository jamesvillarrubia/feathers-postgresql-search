import assert from 'assert';
import app from '../../src/app';

describe('\'authors\' service', () => {
  it('registered the service', () => {
    const service = app.service('authors');

    assert.ok(service, 'Registered the service');
  });
});
