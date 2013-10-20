/**
 * modella-mysql
 *
 * MySQL storage plugin for Modella.
 *
 * @author Alex Mingoia <talk@alexmingoia.com>
 * @link https://github.com/bloodhound/modella-mysql
 */

/**
 * Dependencies.
 */

var extend   = require('extend')
  , lingo    = require('lingo').en
  , mosql    = require('mongo-sql')
  , mysql    = require('mysql');

module.exports = plugin;

module.exports.adapter = mysql;
module.exports.prepareQuery = prepareQuery;

var Model = module.exports.Model = {};
var proto = module.exports.proto = {};

/**
 * Initialize a new MySQL plugin with given `settings`.
 *
 * Refer to felixge/node-mysql documentation for available settings.
 *
 * @param {Object} settings
 * @return {Function}
 * @api public
 */

function plugin(settings) {
  settings.multipleStatement = true;
  // Models share connection pool through shared settings object
  if (!settings.pool) {
    settings.pool = mysql.createPool(settings);
    settings.pool.on('connection', configureConnection);
    process.once('exit', settings.pool.end.bind(settings.pool));
  }
  var mixins = Model;
  return function(Model) {
    Object.defineProperty(Model, '_attr', {
      value: Model.attr
    });
    Object.defineProperty(Model.prototype, '_toJSON', {
      value: Model.prototype.toJSON
    });
    Model.db = settings.pool;
    Model.relations = Model.relations || {};
    if (!Model.tableName) {
      Model.tableName = lingo.pluralize(Model.modelName.toLowerCase());
    }
    extend(Model, mixins);
    Model.prototype.toJSON = proto.toJSON;
    Model.on('initialize', function(model) {
      // Transform UNIX timestamps to Date object
      for (var key in model.attrs) {
        if (model.model.attrs[key].type == 'date'
        && typeof model.attrs[key] == 'number') {
          model.attrs[key] = new Date(model.attrs[key] * 1000);
        }
      }
    });
    return Model;
  };
};

/**
 * Declare model attributes.
 *
 * @param {String} name
 * @param {Object} options
 * @api public
 */

Model.attr = function(name, options) {
  this._attr(name, options);
  if (this.attrs[name].type == 'date') {
    this.prototype[name] = function(val) {
      if (val) {
        if (typeof val == 'number') {
          val = new Date(val * 1000);
        }
        this.attrs[name] = val;
      }
      return this.attrs[name];
    };
  }
  return this;
};

/**
 * Define a "has many" relationship.
 *
 * @example
 *
 *     User.hasMany('posts', { model: Post, foreignKey: 'userId' });
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

Model.hasMany = function(name, params) {
  params.model.relations[this.modelName] = {
    type: 'hasMany',
    name: name,
    params: params
  };
  var hasMany = function(query, cb) {
    if (typeof query == 'function') {
      cb = query;
      query = {};
    }
    query.where = query.where || {};
    if (params.through) {
      if (typeof params.through != 'string') {
        params.through = params.through.tableName;
      }
      query.innerJoin = {};
      query.innerJoin[params.through] = {};
      query.innerJoin[params.through][params.fromKey] = '$' + params.model.tableName + '.' + params.model.primaryKey + '$';
      query.where[params.through + '.' + params.foreignKey] = this.primary();
    }
    else {
      query.where[params.foreignKey] = this.primary();
    }
    params.model.all(query, cb);
  };
  hasMany.create = function(data) {
    data[params.foreignKey] = this.model.primary();
    return new params.model(data);
  };
  this.on('initialize', function(model) {
    model[name] = hasMany;
    model[name].model = model;
  });
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
 * @param {Object} params The `as` and `foreignKey` names are required.
 * @api public
 */

Model.belongsTo = function(Owner, params) {
  Owner.prototype[params.as] = function(cb) {
    var query = {};
    query[Owner.primaryKey] = this[params.foreignKey]();
    Owner.find(query, cb);
  };
  return this;
};

/**
 * Define a "has and belongs to many" relationship.
 *
 * @example
 *
 *     Post.hasAndBelongsToMany('tags', {
 *       as: 'posts',
 *       model: Tag,
 *       fromKey: 'postId',
 *       toKey: 'tagId'
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

Model.hasAndBelongsToMany = function(name, params) {
  if (!params.through) {
    params.through = this.modelName + params.model.modelName;
    if (this.modelName > params.model.modelName) {
      params.through = params.model.modelName + this.modelName;
    }
  }
  params.model.hasMany(params.as, {
    model: this,
    through: params.through,
    fromKey: params.toKey,
    foreignKey: params.fromKey
  });
  this.hasMany(name, {
    model: params.model,
    through: params.through,
    fromKey: params.fromKey,
    foreignKey: params.toKey
  });
  return this;
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
 * Find all models with given `query`.
 *
 * @param {Object} query
 * @param {Function(err, collection)} callback
 * @api public
 */

Model.all = function(query, callback) {
  var sql = this.buildSQL(extend({
    type: 'select',
    table: this.tableName
  }, query));
  this.query(sql.query, sql.values, function(err, rows, fields) {
    if (err) return callback(err);
    var collection = [];
    if (rows && rows.length) {
      for (var len = rows.length, i=0; i<len; i++) {
        collection.push(new (this)(rows[i]));
      }
    }
    callback(null, collection);
  });
};

/**
 * Count models with given `query`.
 *
 * @param {Object} query
 * @param {Function(err, count)} callback
 * @api public
 */

Model.count = function(query, callback) {
  var sql = this.buildSQL(extend({
    type: 'select',
    columns: ['count(*)'],
    table: this.tableName
  }, query));
  this.query(sql.query, sql.values, function(err, rows, fields) {
    if (err) return callback(err);
    var count = rows[0]['count(*)'];
    callback(null, count);
  });
};

/**
 * Save.
 *
 * @param {Function(err, attrs)} fn
 * @api private
 */

Model.save = function(fn) {
  var sql = this.model.buildSQL({
    type: 'insert',
    table: this.model.tableName,
    values: this.toJSON()
  });
  this.model.query(sql.query, sql.values, function(err, rows, fields) {
    if (err) return fn(err);
    var body = { };
    body[this.primaryKey] = rows.insertId;
    fn(null, body);
  });
};

/**
 * Update.
 *
 * @param {Function(err, attrs)} fn
 * @api private
 */

Model.update = function(fn) {
  var body = this.changed();
  var where = {};
  where[this.model.primaryKey] = this.primary();
  var sql = this.model.buildSQL({
    type: 'update',
    table: this.model.tableName,
    where: where,
    values: body
  });
  this.model.query(sql.query, sql.values, function(err, rows, fields) {
    if (err) return fn(err);
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
  var query = {
    type: 'delete',
    table: this.model.tableName,
    where: {}
  };
  query.where[this.model.primaryKey] = this.primary();
  var sql = this.model.buildSQL(query);
  this.model.query(sql.query, sql.values, function(err, rows) {
    if (err) return fn(err);
    fn();
  });
};

/**
 * Wrapper for `Model.db.query`. Transforms column/field names in results.
 */

Model.query = function(statement, values, callback) {
  var Model = this;
  Model.db.query(statement, values, function(err, rows, fields) {
    if (err) return callback(err);
    if (rows.length) {
      var keys = Object.keys(fields);
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
    }
    callback.call(Model, err, rows, fields);
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
 * Return model attributes JSON. Converts attribute types to proper output
 * format. For example, `Date` is transformed to UNIX timestamp.
 *
 * @return {Object}
 * @api private
 */

proto.toJSON = function() {
  var attrs = this.model.attrs;
  var json = this._toJSON.call(this);
  for (var attr in json) {
    if (attrs[attr].type == 'date') {
      json[attr] = Math.ceil(this[attr]().getTime() / 1000);
    }
  }
  return json;
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
        if (!param.match(/(table|type|values|related|where|offset|limit|order|groupBy)$/)) {
          query.where[param] = query[param];
          delete query[param];
        }
      }
    }
  }
  // Relations
  if (query.related) {
    var relation = Model.relations[query.related ? query.related.model.modelName : ''];
    if (relation) {
      var params = relation.params;
      if (params.through) {
        if (typeof params.through != 'string') {
          params.through = params.through.tableName;
        }
        query.innerJoin = {};
        query.innerJoin[params.through] = {};
        query.innerJoin[params.through][params.fromKey] = '$' + params.model.tableName + '.' + params.model.primaryKey + '$';
        query.where[params.through + '.' + params.foreignKey] = query.related.primary();
      }
      else {
        query.where[params.foreignKey] = query.related.primary();
      }
    }
    delete query.related;
  }
  // Values
  if (query.values) {
    var values = query.values;
    for (var key in values) {
      if (Model.attrs[key].dataFormatter) {
        values[key] = Model.attrs[key].dataFormatter(values[key], Model);
      }
      else if (values[key] instanceof Date) {
        values[key] = Math.floor(values[key].getTime() / 1000);
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
  return query;
};

/**
 * Handles transformation of custom column names.
 */

function handleResult(done) {
  return function(err, rows, fields) {
  };
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
