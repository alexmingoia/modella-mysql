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

var extend = require('extend');
var lingo = require('lingo').en;
var mysql = require('mysql');
var sql = require('mongo-sql').sql;

/**
 * Initialize a new MySQL plugin with given `settings`.
 *
 * Refer to felixge/node-mysql documentation for available settings.
 *
 * @param {Object} settings
 * @return {Function}
 * @api public
 */

module.exports = function(settings) {
  var connection = mysql.createConnection(settings);
  return function(Model) {
    Model.mysql = connection;
    Model.mysql.__ANSIMode;
    // Set query value escape character to `$1, $2, $3..` to conform to
    // mongo-sql's query value escape character.
    Model.mysql.config.queryFormat = plugin.queryFormat;
    if (!Model.tableName) {
      Model.tableName = lingo.pluralize(Model.modelName.toLowerCase());
    }
    extend(Model, plugin);
    return Model;
  };
};

var plugin = {};

/**
 * Save.
 *
 * @param {Function(err, attrs)} fn
 * @api private
 */

plugin.save = function(fn) {
  var query = sql({
    type: 'insert',
    table: this.model.tableName,
    values: this.toJSON()
  });
  this.model.mysql.query(query.toString(), query.values, function(err, rows, fields) {
    if (err) return fn(err);
    this.primary(rows.insertId);
    fn(null, fields);
  }.bind(this));
};

/**
 * Update.
 *
 * @param {Function(err, attrs)} fn
 * @api private
 */

plugin.update = function(fn) {
  var body = this.toJSON();
  if (body[this.model.primaryKey]) delete body[this.model.primaryKey];
  var query = sql({
    type: 'update',
    table: this.model.tableName,
    values: body
  });
  this.model.mysql.query(query.toString(), query.values, function(err, rows, fields) {
    if (err) return fn(err);
    fn(null, fields);
  }.bind(this));
};

/**
 * Remove.
 *
 * @param {Function(err, attrs)} fn
 * @api private
 */

plugin.remove = function(fn) {
  var query = sql({
    type: 'delete',
    table: this.model.tableName,
    values: this.toJSON()
  });
  this.model.mysql.query(query.toString(), query.values, function(err, rows) {
    if (err) return fn(err);
    fn();
  }.bind(this));
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

plugin.queryFormat = function(query, values) {
  if (!values || !values.length) return query;
  return query.replace(/\$\d+/g, function(match) {
    var i = Number(String(match).substr(1)) - 1;
    if (values[i]) return this.escape(values[i]);
    return match;
  }.bind(this));
};
