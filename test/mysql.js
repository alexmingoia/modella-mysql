/**
 * modella-mysql tests.
 */

var should = require('should');
var modella = require('modella');

var mysql;

var settings = {
  host: process.env.NODE_TEST_MYSQL_ADDRESS || '127.0.0.1',
  user: process.env.NODE_TEST_MYSQL_USER || 'root',
  password: process.env.NODE_TEST_MYSQL_PASSWORD || '',
  port: process.env.NODE_TEST_MYSQL_PORT || 3306,
  multipleStatements: true
};

describe('module', function(done) {
  it('should export plugin factory', function(done) {
    mysql = require('..');
    should.exist(mysql);
    mysql.should.be.a('function');
    done();
  });

  it('should construct new mysql plugins', function(done) {
    var plugin = mysql(settings);
    should.exist(plugin);
    plugin.should.be.a('function');
    done();
  });
});

describe('plugin', function() {
  it('should extend Model with plugin methods', function(done) {
    var User = modella('User').attr('id').attr('name');
    User.use(mysql(settings));
    User.should.have.property('save');
    User.should.have.property('update');
    User.should.have.property('remove');
    done();
  });

  it('should expose db connection on model', function(done) {
    var User = modella('User').attr('id').attr('name');
    User.use(mysql(settings));
    User.should.have.property('db');
    User.db.should.have.property('query');
    done();
  });
});

describe('Model', function() {
  var User = modella('User').attr('id').attr('name');
  var Post = modella('Post').attr('id').attr('title').attr('user_id');

  before(function(done) {
    User.use(require('..')(settings));
    Post.use(require('..')(settings));
    User.db.query(
      'CREATE DATABASE IF NOT EXISTS `modella_test`; ' +
      'USE `modella_test`; ' +
      'CREATE TABLE IF NOT EXISTS `users` (' +
      '`id` int(11) unsigned NOT NULL AUTO_INCREMENT, ' +
      '`name` varchar(255) NOT NULL DEFAULT \'\', ' +
      'PRIMARY KEY (`id`)); ' +
      'CREATE TABLE IF NOT EXISTS `posts` (' +
      '`id` int(11) unsigned NOT NULL AUTO_INCREMENT, ' +
      '`user_id` int(11) unsigned DEFAULT NULL, ' +
      '`title` varchar(255) NOT NULL DEFAULT \'\', ' +
      'PRIMARY KEY (`id`), KEY `user_id` (`user_id`), ' +
      'CONSTRAINT `posts_ibfk_1` FOREIGN KEY (`user_id`) ' +
      'REFERENCES `users` (`id`) ON DELETE CASCADE); ',
      function(err) {
        if (err) return done(err);
        User.db.on('connection', function(connection) {
          connection.query('USE `modella_test`');
        });
        done();
      }
    );
  });

  afterEach(function(done) {
    User.db.query(
      'DELETE FROM `users` WHERE 1',
      function(err) {
        if (err) return done(err);
        done();
      }
    );
  });

  describe('.hasMany', function() {
    it('should define proto methods', function(done) {
      User.hasMany('posts', { model: Post, foreignKey: 'user_id' });
      var user = new User({ name: 'alex' });
      user.should.have.property('posts');
      user.posts.should.be.a('function');
      user.posts.should.have.property('create');
      user.posts.create.should.be.a('function');
      done();
    });

    it('should create new related models', function(done) {
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
    it('should define proto methods', function(done) {
      User.belongsTo(Post, { as: 'author', foreignKey: 'user_id' });
      var post = new Post({ title: "alex's post" });
      post.should.have.property('author');
      post.author.should.be.a('function');
      done();
    });
  });

  describe('.hasAndBelongsToMany', function() {
    it('should define proto methods', function(done) {
      User.hasAndBelongsToMany('posts', { as: 'author', model: Post, foreignKey: 'user_id' });
      var user = new User({ name: 'alex' });
      user.should.have.property('posts');
      user.posts.should.be.a('function');
      user.posts.should.have.property('create');
      user.posts.create.should.be.a('function');
      var post = new Post({ title: "alex's post" });
      post.should.have.property('author');
      post.author.should.be.a('function');
      done();
    });
  });

  describe('.all', function() {
    it('should find all models successfully', function(done) {
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
              found.should.be.an.instanceOf(Array);
              found.pop().primary().should.equal(userB.primary());
              done();
            }
          );
        });
      });
    });
  });

  describe('.count', function() {
    it('should count models successfully', function(done) {
      var userA = new User({name: 'alex'});
      var userB = new User({name: 'jeff'});
      userA.save(function(err) {
        if (err) return done(err);
        userB.save(function(err) {
          if (err) return done(err);
          User.count(
            { where: { $or: { id: userA.primary(), name: "jeff" }}},
            function(err, found) {
              if (err) return done(err);
              should.exist(found);
              found.should.equal(2);
              done();
            }
          );
        });
      });
    });
  });

  describe('.find', function() {
    it('should find model by id successfully', function(done) {
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
  });

  describe('#save', function() {
    it('should insert new record successfully', function(done) {
      var user = new User({name: 'alex'});
      user.save(function(err) {
        should.not.exist(err);
        should.exist(user.primary());
        done();
      });
    });
  });

  describe('#update', function() {
    it('should update a record successfully', function(done) {
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
  });

  describe('#remove', function() {
    it('should remove a record successfully', function(done) {
      var user = new User({name: 'alex'});
      user.save(function(err) {
        user.remove(function(err) {
          should.not.exist(err);
          done();
        });
      });
    });
  });

  after(function(done) {
    User.db.query('DROP DATABASE IF EXISTS modella_test', function(err) {
      if (err) return done(err);
      done();
    });
  });
});
