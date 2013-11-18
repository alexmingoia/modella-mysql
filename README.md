# modella-mysql

[![Build Status](https://secure.travis-ci.org/alexmingoia/modella-mysql.png?branch=master)](http://travis-ci.org/alexmingoia/modella-mysql)
[![Dependency Status](https://david-dm.org/alexmingoia/modella-mysql.png)](http://david-dm.org/alexmingoia/modella-mysql)

MySQL persistence layer for [Modella](https://github.com/modella/modella).

## Installation

```sh
npm install modella-mysql
```

## Example

```javascript
var modella = require('modella');
var mysql = require('modella-mysql');

var User = modella('User');

User.use(mysql({
  database: 'mydb',
  user: 'root'
});
```

## API

### exports(settings, options)

Create a new Modella plugin with the given database `settings` and `options`.

`settings` same as settings for
[node-mysql](https://github.com/felixge/node-mysql/)

`options`
* `tableName` The table for this model. Defaults to singularized model name.
* `maxLimit` The maximum number of records to select at once. Default is 200.

### Model.all(query, callback)

Get all models using given `query`.

```javascript
User.find({ where: { city: 'San Francisco' }}, function(err, result) {
  console.log(result);
  // => { data: [...], limit: 50, offset: 0, total: 43834 }
});
```

The callback result is an object with the following properties:

`data` array of found models  
`limit` maximum number of models returned (page size)  
`offset` offset for pagination  
`total` total number of models found with query

The `limit`, `offset`, and `total` properties are used in building pagination.

### Model.find(id|query, callback)

Find a model by given `id` or `query`.

```javascript
User.find(5, function(err, user) {
  user.name(); // => Alex
});

User.find({ where: { name: 'Alex' }}, function(err, user) {
  user.name(); // => Alex
});
```

### Model.all(query, callback)

Find models using given `query`.

```javascript
User.all({ $gt: { created_at: lastWeek} }, function(err, users) {
  // ...
});
```

The `users` object looks like:

```json
{
  "total": 32443,
  "limit": 50,
  "offset": 0,
  "data": [user, user, ...]
}
```

### Model.hasMany(name, params)

Define a "has many" relationship with given `name` and `params`.

```javascript
User.hasMany('posts', { model: Post, foreignKey: 'user_id' });

// Creates methods:

user.posts(function(err, posts) {
  // ...
})

var post = user.posts.create();
```

### Model.belongsTo(Model, params)

Define a "belongs to" relationship with given `Model`.

```javascript
User.belongsTo(Post, { as: 'author', foreignKey: 'user_id' });

// Creates method:

post.author(function(err, user) {
  // ...
});
```

### Model.hasAndBelongsToMany(name, params)

Define a "has and belongs to many" relationship with given `name` and `params`.

```javascript
User.hasAndBelongsToMany(Post, {
  as: 'posts',
  through: PostUser,
  fromKey: 'user_id',
  toKey: 'post_id'
});

// Creates methods:

user.posts(function(err, posts) {
  // ...
})

var post = user.posts.create();

post.author(function(err, user) {
  // ...
});
```

## Events

### mysql before save

```javascript
User.on('mysql before save', function(model, attrs) {
  // ...
});

user.on('mysql before save', function(attrs) {
  // ...
});
```

### mysql after save

```javascript
User.on('mysql after save', function(model) {
  // ...
});

user.on('mysql after save', function() {
  // ...
});
```

### mysql before update

```javascript
User.on('mysql before update', function(model) {
  // ...
});

user.on('mysql before update', function() {
  // ...
});
```

### mysql after update

```javascript
User.on('mysql after update', function(model) {
  // ...
});

user.on('mysql after update', function() {
  // ...
});
```

### mysql before remove

```javascript
User.on('mysql before remove', function(model) {
  // ...
});

user.on('mysql before remove', function() {
  // ...
});
```

### mysql after remove

```javascript
User.on('mysql after remove', function(model) {
  // ...
});

user.on('mysql after remove', function() {
  // ...
});
```

### exports.adapter

[MySQL](https://github.com/felixge/node-mysql) module.

### Connection pooling

Models that share a settings object will share a connection pool, exposed via
`settings.pool`.

### Queries

The query is a subset of [mongo-sql](https://github.com/goodybag/mongo-sql).
The `type`, `columns`, and `table` properties are handled by modella-mysql.

### Custom table / field names

Custom table names are specified using the `tableName` option. For example:

```javascript
User.use(mysql({
  database: 'mydb',
  user: 'root'
}, {
  tableName: 'users'
}));
```

Custom field names are provided by a `columnName` property in the attribute
definition. For example:

```javascript
User
  .attr('id')
  .attr('firstName', {
    type: 'string',
    length: 255,
    columnName: 'first_name'
  })
  .attr('lastName', {
    type: 'string',
    length: 255,
    columnName: 'last_name'
  });
```

### Date types

Attributes with `type: "date"` will be handled based on the `columnType`
property. This property can either be "datetime", "timestamp", or "integer",
corresponding to MySQL column type.

### Data formatters

If you need to control exactly how a data-type is determined, set the attribute
definition's `dataFormatter` function:

```javascript
var Event = modella('Event');

Event.attr('date', { dataFormatter: function(value, Event) {
  value = Math.floor(value.getTime() / 1000);
  return value;
});
```

## Tests

Tests are written with [mocha](https://github.com/visionmedia/mocha) and
[should](https://github.com/visionmedia/should.js) using BDD-style assertions.

Tests require an accessible MySQL server. Configure the database using the
following set of environment variables:

```sh
export NODE_TEST_MYSQL_HOST="127.0.0.1"
export NODE_TEST_MYSQL_USER="root"
export NODE_TEST_MYSQL_PASSWORD=""
export NODE_TEST_MYSQL_PORT=3306
```
Run the tests with npm:

```sh
npm test
```

## MIT Licensed
