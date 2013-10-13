# modella-mysql

[![Build Status](https://secure.travis-ci.org/alexmingoia/modella-mysql.png?branch=master)](http://travis-ci.org/alexmingoia/modella-mysql)
[![Dependency Status](https://david-dm.org/alexmingoia/modella-mysql.png)](http://david-dm.org/alexmingoia/modella-mysql)

MySQL persistence layer for [Modella](https://github.com/modella/modella).

## Installation

```shell
npm install --global modella-mysql
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

### Model.all(query, callback)

Get all models using given `query`.

```javascript
User.find({ where: { city: 'San Francisco' }}, function(err, users) {
  // ...
});
```

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

### Model.count(query, callback)

Count all models using given `query`.

```javascript
User.count({ where: { city: 'San Francisco' }}, function(err, count) {
  // ...
});
```

### Model.hasMany(name, params)

Define a "has many" relationship with given `name` and `params`.

```javascript
User.hasMany('posts', { model: Post, foreignKey: 'userId' });

// Creates methods:

user.posts(function(err, posts) {
  // ...
})

var post = user.posts.create();
```

### Model.belongsTo(Model, params)

Define a "belongs to" relationship with given `Model`.

```javascript
User.belongsTo(Post, { as: 'author', foreignKey: 'userId' });

// Creates method:

post.author(function(err, user) {
  // ...
});
```

### Model.hasAndBelongsToMany(name, params)

Define a "has and belongs to many" relationship with given `name` and `params`.

```javascript
User.hasAndBelongsToMany('posts', {
  as: 'author',
  model: Post,
  foreignKey: 'userId'
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

### exports.adapter

[MySQL](https://github.com/felixge/node-mysql) module.

### Connection pooling

Models that share a settings object will share a connection pool, exposed via
`settings.pool`.

### Queries

The query is a subset of [mongo-sql](https://github.com/goodybag/mongo-sql).
The `type`, `columns`, and `table` properties are handled by modella-mysql.

### Custom table / field names

Custom table names are provided by the `Model.tableName` attribute. Be sure to
declare it before using the plugin. For example:

```javascript
var User = modella('User');

User.tableName = 'people';

User.(mysql(settings));
```

Custom field names are provided by a `columnName` property in the attribute
definition. For example:

```javascript
User
  .attr('id')
  .attr('firstName', {
    type: String,
    length: 255,
    columnName: 'first_name'
  })
  .attr('lastName', {
    type: String,
    length: 255,
    columnName: 'last_name'
  });
```

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

Run them with npm:

```shell
npm test
```

## MIT Licensed
