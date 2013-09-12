# modella-mysql

Plugin for [Modella](https://github.com/modella/modella) providing a
persistence layer to MySQL.

## Installation

```shell
npm install --global modella-mysql
```

## Example

```javascript
var model = require('modella');
var mysql = require('modella-mysql');

var User = model('User');

User.use(mysql);
```

## API

### Model.all([query], fn)

Get all models.

### Model.find([query], fn)

Find a model.

### model.save([options], fn)

Save the model instance.

### model.destroy([options], fn)

Destroy/remove the model instance.

## Tests

Tests are written with [mocha](https://github.com/visionmedia/mocha) and
[should](https://github.com/visionmedia/should.js) using BDD-style assertions.

Run them with npm:

```shell
npm test
```

## MIT Licensed
