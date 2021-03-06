/**
 * modella-mysql tests.
 */

var should = require('should');
var modella = require('modella');
var mysql = require('..');

var settings = {};

mysql.adapter.createPool = function(settings) {
  return {
    on: function(event, callback) {},
    end: function() {},
    query: function(statement, values, done) {
      done(null, [], {});
    }
  };
};

describe('module', function(done) {
  it('exports plugin factory', function(done) {
    should.exist(mysql);
    mysql.should.be.a('function');
    done();
  });

  it('constructs new mysql plugins', function(done) {
    var plugin = mysql(settings);
    should.exist(plugin);
    plugin.should.be.a('function');
    done();
  });
});

describe('plugin', function() {
  it('extends Model with plugin methods', function(done) {
    var User = modella('User').attr('id').attr('name');
    User.use(mysql(settings));
    User.should.have.property('buildSQL');
    User.should.have.property('query');
    User.should.have.property('find');
    User.should.have.property('get');
    User.should.have.property('all');
    User.should.have.property('save');
    User.should.have.property('update');
    User.should.have.property('remove');
    done();
  });

  it('exposes db connection on model', function(done) {
    var User = modella('User').attr('id').attr('name');
    User.use(mysql(settings));
    User.should.have.property('db');
    User.db.should.have.property('query');
    User.should.have.property('query');
    done();
  });
});

describe('Model', function() {
  var User, Post;

  beforeEach(function(done) {
    User = modella('User').attr('id').attr('name');
    Post = modella('Post').attr('id').attr('title').attr('user_id');
    User.use(mysql(settings));
    Post.use(mysql(settings));
    done();
  });

  describe('.hasMany', function() {
    it('defines proto methods', function(done) {
      User.hasMany('posts', { model: Post, foreignKey: 'user_id' });
      var user = new User({ name: 'alex' });
      user.should.have.property('posts');
      user.posts.should.be.a('function');
      user.posts.should.have.property('create');
      user.posts.create.should.be.a('function');
      done();
    });

    it('creates new related models successfully', function(done) {
      User.hasMany('posts', { model: Post, foreignKey: 'user_id' });
      var user = new User({ id: 1, name: 'alex' });
      var query = Post.db.query;
      Post.db.query = function(statement, values, cb) {
        Post.db.query = query;
        statement.sql.should.equal(
          'insert into "post" ("title", "user_id") values ($1, $2)'
        );
        values.should.include("alex's post", 1);
        cb(null, {insertId: 2});
      };
      var post = user.posts.create({ title: "alex's post" });
      post.save(function(err) {
        should.not.exist(err);
        should.exist(post.primary());
        done();
      });
    });
  });

  describe('.belongsTo', function() {
    it('defines proto methods', function(done) {
      User.belongsTo(Post, { as: 'author', foreignKey: 'user_id' });
      var post = new Post({ title: "alex's post" });
      post.should.have.property('author');
      post.author.should.be.a('function');
      done();
    });
  });

  describe('.hasAndBelongsToMany', function() {
    it('defines proto methods', function(done) {
      User.hasAndBelongsToMany('posts', { as: 'author', model: Post, foreignKey: 'user_id' });
      var user = new User({ name: 'alex' });
      user.should.have.property('posts');
      user.posts.should.be.a('function');
      user.posts.should.have.property('create');
      user.posts.create.should.be.a('function');
      done();
    });
  });

  describe('.all', function() {
    it('finds all models successfully', function(done) {
      var userA = new User({id: 1, name: 'alex'});
      var userB = new User({id: 2, name: 'jeff'});
      var query = User.db.query;
      User.db.query = function(statement, values, callback) {
        statement.sql.should.include(
          'from "user" where "user"."id" = $1 or "user"."name" = $2 limit $3'
        );
        for (var key in userA.attrs) {
          userA.attrs[User.tableName + '_' + key] = userA.attrs[key];
        }
        for (var key in userB.attrs) {
          userB.attrs[User.tableName + '_' + key] = userB.attrs[key];
        }
        callback(null, [userA.attrs, userB.attrs], userB.attrs);
      };
      User.all(
        { where: { $or: { id: userA.primary(), name: "jeff" }}},
        function(err, found) {
          User.db.query = query;
          if (err) return done(err);
          should.exist(found);
          found.should.have.property('data');
          found.data.should.be.instanceOf(Array);
          found.should.have.property('limit', 50);
          found.should.have.property('offset');
          found.data.pop().primary().should.equal(userB.primary());
          done();
        }
      );
    });

    it('passes errors to callback', function(done) {
      var user = new User({ name: 'alex' });
      user.save(function(err) {
        if (err) return done(err);
        var query = User.db.query;
        User.db.query = function(statement, values, callback) {
          callback(new Error('error finding users.'));
        };
        User.all(
          { where: { $or: { id: user.primary(), name: "alex" }}},
          function(err, found) {
            User.db.query = query;
            should.exist(err);
            err.should.have.property('message', 'error finding users.');
            done();
          }
        );
      });
    });

    it("uses attribute definition's columnName in queries", function(done) {
      User = modella('User').attr('id').attr('fullname', {
        type: 'string',
        length: 255,
        columnName: 'name'
      });
      User.use(require('..')(settings));
      var user = new User({ fullname: 'alex' });
      var query = User.db.query;
      User.db.query = function(statement, values, cb) {
        User.db.query = query;
        statement.sql.should.equal(
          'insert into "user" ("name") values ($1)'
        );
        cb(null, { insertId: 1 }, {});
      };
      user.save(function(err) {
        if (err) return done(err);
        user.should.have.property('fullname');
        user.fullname().should.equal('alex');
        done();
      });
    });
  });

  describe('.find', function() {
    it('finds model by id successfully', function(done) {
      var user = new User({id: 1, name: 'alex'});
      var query = User.db.query;
      User.db.query = function(statement, values, cb) {
        statement.sql.should.equal(
          'select "user".* from "user" where "user"."id" = $1'
        );
        User.db.query = query;
        for (var key in user.attrs) {
          user.attrs[User.tableName + '_' + key] = user.attrs[key];
        }
        cb(null, [user.attrs], {});
      };
      User.find(user.primary(), function(err, found) {
        if (err) return done(err);
        should.exist(found);
        user.primary().should.equal(found.primary());
        done();
      });
    });

    it('passes errors to callback', function(done) {
      var user = new User({ name: 'alex' });
      user.save(function(err) {
        if (err) return done(err);
        var query = User.db.query;
        User.db.query = function(statement, values, callback) {
          callback(new Error('error finding user.'));
        };
        User.find(user.primary(), function(err, found) {
          User.db.query = query;
          should.exist(err);
          err.should.have.property('message', 'error finding user.');
          done();
        });
      });
    });
  });

  describe('.removeAll', function() {
    it('removes models successfully', function(done) {
      var query = User.db.query;
      User.db.query = function(statement, values, cb) {
        statement.sql.should.equal(
          'delete from "user" where "user"."name" = $1'
        );
        cb(null, {}, {});
      };
      User.removeAll({ name: 'alex' }, function(err) {
        User.db.query = query;
        if (err) return done(err);
        done();
      });
    });

    it('passes errors to callback', function(done) {
      var query = User.db.query;
      User.db.query = function(statement, values, cb) {
        cb(new Error("error removing all models."));
      };
      User.removeAll({ name: 'alex' }, function(err) {
        User.db.query = query;
        should.exist(err);
        err.should.have.property('message', 'error removing all models.');
        done();
      });
    });
  });

  describe('#save', function() {
    it('saves new model successfully', function(done) {
      var user = new User({name: 'alex'});
      var query = User.db.query;
      User.db.query = function(statement, values, cb) {
        User.db.query = query;
        values.should.include('alex');
        cb(null, { insertId: 1 }, {});
      };
      user.save(function(err) {
        should.not.exist(err);
        should.exist(user.primary());
        done();
      });
    });

    it('passes errors to callback', function(done) {
      var user = new User({ name: 'alex' });
      var query = User.db.query;
      User.db.query = function(statement, values, callback) {
        User.db.query = query;
        callback(new Error('error saving user.'));
      };
      user.save(function(err) {
        should.exist(err);
        err.should.have.property('message', 'error saving user.');
        done();
      });
    });
  });

  describe('#update', function() {
    it('updates model successfully', function(done) {
      var user = new User({id: 1, name: 'alex'});
      var query = User.db.query;
      User.db.query = function(statement, values, cb) {
        User.db.query = query;
        statement.sql.should.equal(
          'update "user" set "name" = $1 where "user"."id" = $2'
        );
        values.should.include('jeff', 1);
        cb(null, [user], user.attrs);
      };
      user.name('jeff');
      user.save(function(err) {
        should.not.exist(err);
        user.name().should.equal('jeff');
        done();
      });
    });

    it('passes errors to callback', function(done) {
      var user = new User({ name: 'alex' });
      user.save(function(err) {
        if (err) return done(err);
        user.name('jeff');
        var query = User.db.query;
        User.db.query = function(statement, values, callback) {
          callback(new Error('error updating user.'));
        };
        user.save(function(err) {
          User.db.query = query;
          should.exist(err);
          err.should.have.property('message', 'error updating user.');
          done();
        });
      });
    });
  });

  describe('#remove', function() {
    it('removes model successfully', function(done) {
      var user = new User({id: 1, name: 'alex'});
      var query = User.db.query;
      User.db.query = function(statement, values, cb) {
        User.db.query = query;
        statement.sql.should.equal(
          'delete from "user" where "user"."id" = $1'
        );
        values.should.include(1);
        cb(null, [], {});
      };
      user.remove(function(err) {
        should.not.exist(err);
        done();
      });
    });

    it('passes errors to callback', function(done) {
      var user = new User({ id: 1, name: 'alex' });
      var query = User.db.query;
      User.db.query = function(statement, values, callback) {
        User.db.query = query;
        callback(new Error('error removing user.'));
      };
      user.remove(function(err) {
        should.exist(err);
        err.should.have.property('message', 'error removing user.');
        done();
      });
    });
  });
});
