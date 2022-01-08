import assert from 'assert';
import app from '../../src/app';

describe('\'books\' service', () => {
  it('registered the service', () => {
    const service = app.service('books');

    assert.ok(service, 'Registered the service');
  });
});
