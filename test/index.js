var assert = require('assert')
var fs = require('fs')
var uglify = require('uglify-js')
var addWith = require('../')

var outputs = []

var sentinel = {}
var sentinel2 = {}
describe('addWith("obj", "console.log(a)")', function () {
  it('adds the necessary variable declarations', function (done) {
    var src = addWith('obj', 'console.log(a)')
    outputs.push(src)
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
    outputs.push(src)
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
    outputs.push(src)
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
    outputs.push(src)
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
    outputs.push(src)
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
    outputs.push(src)
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
    outputs.push(src)
    // obj.bar = obj.foo
    var obj = {
        foo: 'ding'
      }
    assert(Function('obj', src)(obj) === 'ding')
    done()
  })
  it('supports returning without argument', function (done) {
    var src = addWith('obj || {}', 'return; return foo')
    outputs.push(src)
    var obj = {
      foo: 'ding'
    }
    assert(Function('obj', src)(obj) === undefined)
    done()
  })
  it('supports returning undefined', function (done) {
    var src = addWith('obj || {}', 'return foo')
    outputs.push(src)
    assert(Function('obj', src + ';return "ding"')({}) === undefined)
    done()
  })
  it('supports not actually returning', function (done) {
    var src = addWith('obj || {}', 'if (false) return foo')
    outputs.push(src)
    assert(Function('obj', src + ';return "ding"')({}) === 'ding')
    done()
  })
})

describe('addWith("obj || {}", "return this[foo]")', function () {
  it('keeps reference to this', function (done) {
    var src = addWith('obj || {}', 'return this[foo]')
    outputs.push(src)
    // obj.bar = obj.foo
    var obj = {
        foo: 'bar',
        bar: 'ding',
        fn: Function('obj', src)
      }
    assert(obj.fn(obj) === 'ding')
    done()
  })

  it('does not pass `undefined` as an argument', function (done) {
    var src = addWith('obj || {}', 'return this[foo]')
    assert(!~src.indexOf('"undefined" in locals_for_with'))
    assert(!~src.indexOf('locals_for_with.undefined'))
    assert(!~src.indexOf('typeof undefined!=="undefined"?undefined:undefined'))
    outputs.push(src)
    done()
  })
})
describe('addWith("obj", "var x = (y) => y + z; x(10);")', function () {
  it('keeps reference to this', function (done) {
    var src = addWith('obj', 'var x = (y) => y + z; x(10);')
    outputs.push(src)
    done()
  })
})

describe('with reserved words', function () {
  it('works just fine', function (done) {
    var src = addWith('obj', 'console.log(yield)')
    outputs.push(src)
    Function('console,obj', src)(
      {
        log: function (a) {
          assert(a === sentinel)
          done()
        }
      },
      {'yield': sentinel})
  })
})
after(function () {
  function beautify(src) {
    try {
      return uglify.minify('function example() {' + src + '}', {fromString: true, mangle: false, compress: false, output: {beautify: true}}).code;
    } catch (ex) {
      return src;
    }
  }
  fs.writeFileSync(__dirname + '/output.js', outputs.map(beautify).map(function (out, index) { return '// example-' + index + '\n\n' + out; }).join('\n\n\n'))
})
