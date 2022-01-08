import assert from 'assert';
import app from '../../src/app';

describe('\'others\' service', () => {
  it('registered the service', () => {
    const service = app.service('others');

    assert.ok(service, 'Registered the service');
  });
});
