/**
 * modella-mysql
 *
 * MySQL storage plugin for Modella.
 *
 * @author Alex Mingoia <talk@alexmingoia.com>
 * @link https://github.com/bloodhound/modella-mysql
 */

var async    = require('async')
  , extend   = require('extend')
  , modella  = require('modella')
  , lingo    = require('lingo').en
  , mosql    = require('mongo-sql')
  , mysql    = require('mysql');

module.exports = plugin;

// Expose `mysql` module.
// If you want to access the Model's db connection, use `Model.db` (a pool).
module.exports.adapter = mysql;

var Model = module.exports.Model = {};
var proto = module.exports.proto = {};

/**
 * Initialize a new MySQL plugin with given `settings`.
 *
 * options
 *     - maxLimit  Maximum size of query limit parameter (Default: 200).
 *     - tableName MySQL table name for this Model.
 *
 * @param {Object} settings database settings for github.com/felixge/node-mysql
 * @param {Object} options options for this plugin instance
 * @return {Function}
 * @api public
 */

function plugin(settings, options) {
  var mixins = Model;

  options = options || {};

  return function(Model) {

    // Models share connection pool through shared settings object
    if (!settings.pool) {
      settings.multipleStatement = true;
      settings.pool = mysql.createPool(settings);
      settings.pool.on('connection', configureConnection);
      process.once('exit', settings.pool.end.bind(settings.pool));
    }

    Model.db = settings.pool;
    Model.db.settings = settings;
    Model.db.options = options;
    Model.relations = Model.relations || {};

    if (options.tableName) {
      Model.tableName = options.tableName;
    }
    if (!Model.tableName) {
      Model.tableName = lingo.singularize(Model.modelName.toLowerCase());
    }

    extend(Model, mixins);

    Model.on('setting', formatAttrs);
    Model.on('initializing', formatAttrs);

    return Model;
  };
};

/**
 * Define a "has many" relationship.
 *
 * @example
 *
 *     User.hasMany(Post, { as: 'posts', foreignKey: 'user_id' });
 *
 *     user.posts(function(err, posts) {
 *       // ...
 *     });
 *
 *     var post = user.posts.create();
 *
 * @param {String} name
 * @param {Object} params The `model` constructor and `foreignKey` name are required.
 * @return {Model}
 * @api public
 */

Model.hasMany = function(anotherModel, params) {
  if (typeof anotherModel === 'string') {
    params.as = anotherModel;
    anotherModel = params.model;
  }

  if (!params.as) {
    params.as = lingo.pluralize(anotherModel.modelName.toLowerCase());
  }

  // corresponds to `user.posts()`
  var asAll = function(query, cb) {
    if (typeof query == 'function') {
      cb = query;
      query = {};
    }
    var where = query.where = (query.where || {});
    if (params.through) {
      query.innerJoin = {};
      params.throughTable = params.through.tableName || params.through;
      if (!params.throughKey) {
        params.throughKey =  anotherModel.modelName.toLowerCase();
        params.throughKey += '_' + anotherModel.primaryKey.toLowerCase();
      }
      var join = query.innerJoin[params.throughTable] = {};
      join[params.foreignKey] =  '$' + anotherModel.tableName;
      join[params.foreignKey] += '.' + anotherModel.primaryKey + '$';
      where[params.throughTable + '.' + params.foreignKey] = this.primary();
    }
    else {
      where[params.foreignKey] = this.primary();
    }
    query.where = where;
    anotherModel.all(query, cb);
  };

  // corresponds to `user.posts.create()`
  asAll.create = function(data) {
    data[params.foreignKey] = this.model.primary();
    return new anotherModel(data);
  };

  this.on('initialize', function(model) {
    model[params.as] = asAll;
    model[params.as].model = model;
  });

  anotherModel.relations[params.foreignKey] = params;

  return this;
};

/**
 * Define a "belongs to" relationship.
 *
 * @example
 *
 *     Post.belongsTo(User, { as: 'author', foreignKey: 'userId' });
 *
 *     post.author(function(err, user) {
 *       // ...
 *     });
 *
 * @param {Model} Owner
 * @param {Object} params The `foreignKey` name is required.
 * @api public
 */

Model.belongsTo = function(anotherModel, params) {
  if (!params.as) {
    params.as = lingo.singularize(anotherModel.modelName).toLowerCase();
  }

  anotherModel.prototype[params.as] = function(cb) {
    var query = {};
    query[anotherModel.primaryKey] = this[params.foreignKey]();
    anotherModel.find(query, cb);
  };

  anotherModel.relations[this.primaryKey] = params;

  return this;
};

/**
 * Define a "has and belongs to many" relationship.
 *
 * @example
 *
 *     Post.hasAndBelongsToMany(Tag, {
 *       as: 'tags',
 *       through: PostTag,
 *       fromKey: 'post_id',
 *       toKey: 'tag_id'
 *     });
 *
 *     post.tags(function(err, tags) {
 *       // ...
 *     });
 *
 *     tag.posts(function(err, posts) {
 *       // ...
 *     });
 *
 * @param {modella.Model} Model
 * @param {Object} params
 * @api public
 */

Model.hasAndBelongsToMany = function(anotherModel, params) {
  if (typeof anotherModel === 'string') {
    params.as = anotherModel;
    anotherModel = params.model;
  }

  if (!params.as) {
    params.as = lingo.pluralize(anotherModel.modelName.toLowerCase());
  }
  if (!params.fromKey) {
    params.fromKey = (this.modelName + '_' + this.primaryKey).toLowerCase();
  }
  if (!params.toKey) {
    params.toKey = anotherModel.modelName + '_' + anotherModel.primaryKey;
    params.toKey = params.toKey.toLowerCase();
  }

  if (!params.through) {
    var name = this.modelName + anotherModel.modelName;
    if (this.modelName > anotherModel.modelName) {
      name = anotherModel.modelName + this.modelName;
    }
    params.through = modella(name).use(plugin(this.db.settings));;
    params.through.tableName = this.modelName + '_' + anotherModel.modelName;
    if (this.modelName > anotherModel.modelName) {
      params.through.tableName = anotherModel.modelName + '_' + this.modelName;
    }
    params.through.tableName = params.through.tableName.toLowerCase();
  }

  params.through.belongsTo(this, { foreignKey: params.fromKey });
  params.through.belongsTo(anotherModel, { foreignKey: params.toKey });

  this.hasMany(anotherModel, {
    as: params.as,
    foreignKey: params.fromKey,
    through: params.through,
    throughKey: params.toKey
  });

  return this;
};

/**
 * Find all models with given `query`.
 *
 * @param {Object} query
 * @param {Function(err, collection)} callback
 * @api public
 */

Model.all = function(query, callback) {
  if (!query.offset) query.offset = 0;
  if (!query.limit) query.limit = 50;
  if (query.pageSize) {
    query.limit = query.pageSize;
    delete query.pageSize;
  }
  if (query.page) {
    query.offset = query.page * query.limit;
    delete query.page;
  }
  if (query.limit > this.db.options.maxLimit) {
    query.limit = this.db.options.maxLimit;
  }
  var self = this;
  var results = {
    data: [],
    limit: Number(query.limit || 50),
    offset: Number(query.offset || 0),
    total: 0
  };
  async.series([
    function(next) {
      var sql = self.buildSQL(extend({
        type: 'select',
        columns: ['count(*)'],
        table: self.tableName
      }, query));
      self.query(sql.query, sql.values, function(err, rows) {
        if (err) return next(err);
        if (rows && rows.length) results.total = rows[0]['count(*)'];
        next();
      });
    },
    function(next) {
      var sql = self.buildSQL(extend({
        type: 'select',
        table: self.tableName
      }, query));
      self.query(sql.query, sql.values, function(err, rows) {
        if (err) return next(err);
        if (rows && rows.length) {
          for (var len = rows.length, i=0; i<len; i++) {
            results.data.push(new (this)(rows[i]));
          }
        }
        next();
      });
    }
  ], function(err) {
    if (err) return callback(err);
    callback(null, results);
  });
};

/**
 * Find model with given `id`.
 *
 * @param {Number|Object} id or query
 * @param {Function(err, model)} callback
 * @api public
 */

Model.find = Model.get = function(id, callback) {
  var query = typeof id == 'object' ? id : { where: { id: id } };
  var sql = this.buildSQL(extend({
    type: 'select',
    table: this.tableName
  }, query));
  this.query(sql.query, sql.values, function(err, rows, fields) {
    if (err) return callback(err);
    var model;
    if (rows && rows.length) {
      model = new (this)(rows[0]);
      return callback(null, model);
    }
    var error = new Error("Could not find " + id + ".");
    error.code = error.status = 404;
    return callback(error);
  });
};

/**
 * Save.
 *
 * @param {Function(err, attrs)} fn
 * @api private
 */

Model.save = function(fn) {
  var model = this;
  this.model.emit('mysql before save', this);
  this.emit('mysql before save');
  var sql = this.model.buildSQL({
    type: 'insert',
    table: this.model.tableName,
    values: this.attrs
  });
  this.model.query(sql.query, sql.values, function(err, rows, fields) {
    if (err) return fn(err);
    formatAttrs(model, model.attrs);
    if (rows.insertId) {
      model.attrs[this.primaryKey] = rows.insertId;
    }
    this.emit('mysql after save', model);
    model.emit('mysql after save');
    fn(null, model.attrs);
  });
};

/**
 * Update.
 *
 * @param {Function(err, attrs)} fn
 * @api private
 */

Model.update = function(fn) {
  var model = this;
  this.model.emit('mysql before update', this);
  this.emit('mysql before update');
  var where = {};
  where[this.model.primaryKey] = this.primary();
  var sql = this.model.buildSQL({
    type: 'update',
    table: this.model.tableName,
    where: where,
    values: this.changed()
  });
  this.model.query(sql.query, sql.values, function(err, rows, fields) {
    if (err) return fn(err);
    this.emit('mysql after update', model);
    model.emit('mysql after update');
    fn(null, fields);
  });
};

/**
 * Remove.
 *
 * @param {Function(err, attrs)} fn
 * @api private
 */

Model.remove = function(fn) {
  var model = this;
  this.model.emit('mysql before remove', this);
  this.emit('mysql before remove');
  var query = {
    type: 'delete',
    table: this.model.tableName,
    where: {}
  };
  query.where[this.model.primaryKey] = this.primary();
  var sql = this.model.buildSQL(query);
  this.model.query(sql.query, sql.values, function(err, rows) {
    if (err) return fn(err);
    this.emit('mysql after remove', model);
    model.emit('mysql after remove');
    fn();
  });
};

/**
 * Wrapper for `Model.db.query`. Transforms column/field names in results.
 */

Model.query = function(statement, values, callback) {
  var Model = this;
  var after = function(rows, fields) {
    if (rows.length) {
      var keys = Object.keys(fields);
      // Transform colum names
      var columnNamesToAttrNames = {};
      for (var attr in Model.attrs) {
        var columnName = Model.attrs[attr].columnName;
        if (columnName) columnNamesToAttrNames[columnName] = attr;
      }
      var columnNames = Object.keys(columnNamesToAttrNames);
      if (columnNames.length) {
        rows.forEach(function(row, i) {
          columnNames.forEach(function(columnName) {
            if (row[columnName]) {
              rows[i][attr] = rows[i][columnName];
              delete rows[i][columnName];
            }
          });
        });
      }
      // Transform boolean values
      rows.forEach(function(row, i) {
        for (var key in row) {
          if (!Model.attrs[key] || !Model.attrs[key].type) continue;
          if (Model.attrs[key].type == 'boolean') {
            row[key] = Boolean(row[key]);
          }
        }
      });
    }
    callback.call(Model, null, rows, fields);
  };
  Model.db.query(statement, values, function(err, rows, fields) {
    if (err) {
      // Re-try query on DEADLOCK error
      if (~err.message.indexOf('DEADLOCK')) {
        return (function retry() {
          var attemptCount = 0;
          function attempt() {
            attemptCount++;
            Model.db.query(statement, values, function(err, rows, fields) {
              if (err) {
                if (attemptCount > 3) return callback(err);
                if (~err.message.indexOf('DEADLOCK')) return attempt();
                return callback(err);
              }
              after(rows, fields);
            });
          };
          attempt();
        })();
      }
      return callback(err);
    }
    after(rows, fields);
  });
};

/**
 * Build SQL query using MoSQL.
 *
 * @link https://github.com/goodybag/mongo-sql
 */

Model.buildSQL = function(query) {
  var sql = mosql.sql(prepareQuery(this, query));
  for (var attr in this.attrs) {
    var columnName = this.attrs[attr].columnName;
    if (columnName) {
      sql.query = sql.query.replace(
        new RegExp('"' + attr + '"', 'g'),
        '"' + columnName + '"'
      );
    }
  }
  return sql;
};

/**
 * Formats attributes when set
 *
 * @param {Model} model
 * @param {Object} attrs
 * @api private
 */

function formatAttrs(model, attrs) {
  for (var attr in attrs) {
    var def = model.model.attrs[attr];
    var val = attrs[attr];
    if (!def) continue;
    if (def.type == 'date' || def.format == 'date') {
      if (typeof val == 'object') continue;
      if (isNaN(val)) {
        attrs[attr] = new Date(val);
      }
      else {
        attrs[attr] = new Date(val * 1000);
      }
    }
  }
};

/**
 * Prepare query.
 *
 * @param {Model} Model
 * @param {Object} query
 * @return {Object}
 * @api private
 */

function prepareQuery(Model, query) {
  var keywords = [];
  for (var key in query) {
    if (query.hasOwnProperty(key) && key.match(/(where|Join)$/)) {
      keywords.push(key);
    }
    if (!isNaN(query[key])) {
      query[key] = Number(query[key]);
    }
  }
  // If no keywords, assume where query
  if (keywords.length == 0) {
    query.where = {};
    for (var param in query) {
      if (query.hasOwnProperty(param)) {
        if (!param.match(/(columns|table|type|values|where|offset|limit|sort|order|groupBy)$/)) {
          query.where[param] = query[param];
          delete query[param];
        }
      }
    }
  }
  if (query.sort) {
    query.order = query.sort;
    delete query.sort;
  }
  // Relations
  var relation, fkWhere;
  if (query.where) {
    for (var key in query.where) {
      if (Model.relations[key]) {
        fkWhere = key;
        relation = Model.relations[key];
      }
    }
  }
  if (relation) {
    if (relation.through) {
      query.innerJoin = {};
      query.innerJoin[relation.through.tableName] = {};
      query.innerJoin[relation.through.tableName][relation.throughKey] = '$' + Model.tableName + '.' + Model.primaryKey + '$';
      query.where[relation.through.tableName + '.' + relation.foreignKey] = query.where[fkWhere];
    }
    else {
      query.where[relation.foreignKey] = query.where[fkWhere];
    }
    if (relation.through || relation.foreignKey != fkWhere) {
      delete query.where[fkWhere];
    }
  }
  // Values
  if (query.values) {
    var values = query.values;
    for (var key in values) {
      var def = Model.attrs[key];
      if (def) {
        if (def.dataFormatter) {
          values[key] = def.dataFormatter(values[key], Model);
        }
        else if (def.format == 'date' || def.type == 'date') {
          switch (def.columnType) {
            case 'datetime':
              values[key] = values[key].toISOString();
              break;
            case 'timestamp':
              var d = values[key];
              values[key] = d.getFullYear() + '-' + pad(d.getMonth()) + '-'
                + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':'
                + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
              break;
            case 'integer':
            case 'number':
            default:
              if (values[key].unix) {
                values[key] = Math.floor(values[key].unix());
              }
              else {
                values[key] = Math.floor(values[key].getTime() / 1000);
              }
          }
        }
      }
      else if (typeof values[key] === 'object') {
        values[key] = JSON.stringify(values[key]);
      }
      else if (typeof values[key] === 'boolean') {
        values[key] = values[key] ? 1 : 'NULL';
      }
      else if (values[key] === undefined) {
        delete values[key];
      }
    }
  }
  if (!query.table) query.table = Model.tableName;
  if (!query.type) query.type = 'select';
  return query;
};

/**
 * node-mysql query formatter.
 *
 * node-mysql uses `?` whereas mongo-sql uses `$1, $2, $3...`,
 * so we have to implement our own query formatter assigned
 * when extending the model class.
 *
 * @link https://github.com/felixge/node-mysql#custom-format
 *
 * @param {String} query
 * @param {Array} values
 * @return {String}
 * @api private
 */

function queryFormat(query, values) {
  if (!values || !values.length) return query;
  return query.replace(/\$\d+/g, function(match) {
    var i = Number(String(match).substr(1)) - 1;
    if (values[i] !== undefined) return this.escape(values[i]);
    return match;
  }.bind(this));
};

/**
 * Enable ANSI_QUOTES and set query formatter for new connections.
 *
 * @api private
 */

function configureConnection(connection) {
  // Set query value escape character to `$1, $2, $3..` to conform to
  // mongo-sql's query value escape character.
  connection.config.queryFormat = queryFormat;
  // Enable ANSI_QUOTES for compatibility with queries generated by mongo-sql
  connection.query('SET SESSION sql_mode=ANSI_QUOTES', [], function(err) {
    if (err) throw err;
  });
};

/**
 * Pad number with leading 0
 */

function pad(num) {
  num = String(num);
  if (num.length == 1) {
    num = '0' + num;
  }
  return num;
};
