var assert = require('assert')

var addWith = require('../')

var sentinel = {}
var sentinel2 = {}
describe('addWith("obj", "console.log(a)")', function () {
  it('adds the necessary variable declarations', function (done) {
    var src = addWith('obj', 'console.log(a)')
    // var a = obj.a;console.log(a)
    Function('console,obj', src)(
      {
        log: function (a) {
          assert(a === sentinel)
          done()
        }
      },
      {a: sentinel})
  })
})
describe('addWith("obj || {}", "console.log(a)")', function () {
  it('adds the necessary variable declarations', function (done) {
    var src = addWith('obj || {}', 'console.log(a)')
    // var locals = (obj || {}),a = locals.a;console.log(a)
    var expected = 2
    Function('console,obj', src)(
      {
        log: function (a) {
          assert(a === sentinel)
          if (0 === --expected) done()
        }
      },
      {a: sentinel})
    Function('console,obj', src)(
      {
        log: function (a) {
          assert(a === undefined)
          if (0 === --expected) done()
        }
      })
  })
})
describe('addWith("obj", "console.log(helper(a))")', function () {
  it('adds the necessary variable declarations', function (done) {
    var src = addWith('obj', 'console.log(helper(a))')
    // var a = obj.a;console.log(helper(a))
    Function('console,obj,helper', src)(
      {
        log: function (a) {
          assert(a === sentinel)
          done()
        }
      },
      {a: sentinel2},
      function (a) {
        assert(a === sentinel2)
        return sentinel
      })
  })
})
describe('addWith("obj || {}", "console.log(locals(a))")', function () {
  it('adds the necessary variable declarations', function (done) {
    var src = addWith('obj || {}', 'console.log(locals(a))')
    // var locals__ = (obj || {}),locals = locals__.locals,a = locals__.a;console.log(locals(a))
    Function('console,obj', src)(
      {
        log: function (a) {
          assert(a === sentinel)
          done()
        }
      },
      {
        a: sentinel2,
        locals: function (a) {
          assert(a === sentinel2)
          return sentinel
        }
      })
  })
})

describe('addWith("obj || {}", "console.log(\'foo\')")', function () {
  it('passes through', function (done) {
    var src = addWith('obj || {}', 'console.log("foo")')
    // console.log(\'foo\')
    Function('console,obj', src)(
      {
        log: function (a) {
          assert(a === 'foo')
          done()
        }
      })
  })
})

describe('addWith("obj || {}", "obj.foo")', function () {
  it('passes through', function (done) {
    var src = addWith('obj || {}', 'obj.bar = obj.foo')
    // obj.bar = obj.foo
    var obj = {
        foo: 'ding'
      }
    Function('obj', src)(obj)
    assert(obj.bar === 'ding')
    done()
  })
})

describe('addWith("obj || {}", "return foo")', function () {
  it('supports returning values', function (done) {
    var src = addWith('obj || {}', 'return foo')
    // obj.bar = obj.foo
    var obj = {
        foo: 'ding'
      }
    assert(Function('obj', src)(obj) === 'ding')
    done()
  })
  it('supports returning undefined', function (done) {
    var src = addWith('obj || {}', 'return foo')
    assert(Function('obj', src + ';return "ding"')({}) === undefined)
    done()
  })
  it('supports not actually returning', function (done) {
    var src = addWith('obj || {}', 'if (false) return foo')
    assert(Function('obj', src + ';return "ding"')({}) === 'ding')
    done()
  })
})