'use strict';

module.exports = (db) => ({
  programmes: require('./programmes')(db),
  lots: require('./lots')(db),
  leads: require('./leads')(db),
  users: require('./users')(db),
  stats: require('./stats')(db),
});
