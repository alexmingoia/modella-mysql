# modella-mysql

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

### Model.all([query], fn)

Get all models.

### Model.find([id|query], fn)

Find a model.

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

## Tests

Tests are written with [mocha](https://github.com/visionmedia/mocha) and
[should](https://github.com/visionmedia/should.js) using BDD-style assertions.

Run them with npm:

```shell
npm test
```

## MIT Licensed
