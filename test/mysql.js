/**
 * modella-mysql tests.
 */

var should = require('should');
var modella = require('modella');
var mysql = require('..');

var settings = {
  host: process.env.NODE_TEST_MYSQL_HOST || '127.0.0.1',
  user: process.env.NODE_TEST_MYSQL_USER || 'root',
  password: process.env.NODE_TEST_MYSQL_PASSWORD || '',
  port: process.env.NODE_TEST_MYSQL_PORT || 3306,
  multipleStatements: true
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

  before(function(done) {
    settings.pool.query(
      'DROP DATABASE IF EXISTS `modella_test`; ' +
      'CREATE DATABASE IF NOT EXISTS `modella_test`; ' +
      'USE `modella_test`; ' +
      'CREATE TABLE IF NOT EXISTS `user` (' +
      '`id` int(11) unsigned NOT NULL AUTO_INCREMENT, ' +
      '`name` varchar(255) NOT NULL DEFAULT \'\', ' +
      'PRIMARY KEY (`id`)); ' +
      'CREATE TABLE IF NOT EXISTS `post` (' +
      '`id` int(11) unsigned NOT NULL AUTO_INCREMENT, ' +
      '`user_id` int(11) unsigned DEFAULT NULL, ' +
      '`title` varchar(255) NOT NULL DEFAULT \'\', ' +
      'PRIMARY KEY (`id`), KEY `user_id` (`user_id`), ' +
      'CONSTRAINT `post_ibfk_1` FOREIGN KEY (`user_id`) ' +
      'REFERENCES `user` (`id`) ON DELETE CASCADE); ',
      function(err) {
        if (err) return done(err);
        settings.pool.on('connection', function(connection) {
          connection.query('USE `modella_test`');
        });
        done();
      }
    );
  });

  after(function(done) {
    settings.pool.query('DROP DATABASE IF EXISTS modella_test', function(err) {
      if (err) return done(err);
      done();
    });
  });

  beforeEach(function(done) {
    User = modella('User').attr('id').attr('name');
    Post = modella('Post').attr('id').attr('title').attr('user_id');
    User.use(mysql(settings));
    Post.use(mysql(settings));
    done();
  });

  afterEach(function(done) {
    settings.pool.query(
      'DELETE FROM `user` WHERE 1',
      function(err) {
        if (err) return done(err);
        done();
      }
    );
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
      var user = new User({ name: 'alex' });
      user.save(function(err) {
        var post = user.posts.create({ title: "alex's post" });
        post.save(function(err) {
          should.not.exist(err);
          should.exist(post.primary());
          done();
        });
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
      var userA = new User({name: 'alex'});
      var userB = new User({name: 'jeff'});
      userA.save(function(err) {
        if (err) return done(err);
        userB.save(function(err) {
          if (err) return done(err);
          User.all(
            { where: { $or: { id: userA.primary(), name: "jeff" }}},
            function(err, found) {
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
      });
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
      var user = new User({name: 'alex'});
      user.save(function(err) {
        User.find(user.primary(), function(err, found) {
          if (err) return done(err);
          should.exist(found);
          user.primary().should.equal(found.primary());
          done();
        });
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

  describe('#save', function() {
    it('saves new model successfully', function(done) {
      var user = new User({name: 'alex'});
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
        callback(new Error('error saving user.'));
      };
      user.save(function(err) {
        User.db.query = query;
        should.exist(err);
        err.should.have.property('message', 'error saving user.');
        done();
      });
    });
  });

  describe('#update', function() {
    it('updates model successfully', function(done) {
      var user = new User({name: 'alex'});
      user.save(function(err) {
        user.name('jeff');
        user.save(function(err) {
          should.not.exist(err);
          user.name().should.equal('jeff');
          done();
        });
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
      var user = new User({name: 'alex'});
      user.save(function(err) {
        user.remove(function(err) {
          should.not.exist(err);
          done();
        });
      });
    });

    it('passes errors to callback', function(done) {
      var user = new User({ name: 'alex' });
      user.save(function(err) {
        if (err) return done(err);
        var query = User.db.query;
        User.db.query = function(statement, values, callback) {
          callback(new Error('error removing user.'));
        };
        user.remove(function(err) {
          User.db.query = query;
          should.exist(err);
          err.should.have.property('message', 'error removing user.');
          done();
        });
      });
    });
  });
});
