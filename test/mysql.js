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
});

describe('Model', function() {
  var User = modella('User').attr('id').attr('name');

  before(function(done) {
    User.use(require('..')(settings));
    User.mysql.query(
      'CREATE DATABASE IF NOT EXISTS `modella_test`;' +
      'USE `modella_test`;' +
      'CREATE TABLE IF NOT EXISTS `users` (' +
      '`id` int(11) unsigned NOT NULL AUTO_INCREMENT, ' +
      '`name` varchar(255) NOT NULL DEFAULT \'\', ' +
      'PRIMARY KEY (`id`)); USE `modella_test`; SET sql_mode=ANSI_QUOTES;',
      function(err) {
        if (err) return done(err);
        done();
      }
    );
  });

  afterEach(function(done) {
    User.mysql.query(
      'DELETE FROM `users` WHERE 1',
      function(err) {
        if (err) return done(err);
        done();
      }
    );
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
    User.mysql.query('DROP DATABASE IF EXISTS modella_test', function(err) {
      if (err) return done(err);
      done();
    });
  });
});
