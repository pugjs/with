var assert = require('assert')
var fs = require('fs')
var uglify = require('uglify-js')
var addWith = require('../src')

var outputs = []

var sentinel = {}
var sentinel2 = {}

function tryCatch(block) {
  try {
    return {result: 'returned', value: block()}
  } catch(e) {
    return {result: 'threw', error: e}
  }
}

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
  it('passes through', function () {
    var src = addWith('obj || {}', 'obj.bar = obj.foo')
    outputs.push(src)
    // obj.bar = obj.foo
    var obj = {
        foo: 'ding'
      }
    Function('obj', src)(obj)
    assert(obj.bar === 'ding')
  })
})

describe('addWith("obj || {}", "return foo")', function () {
  it('supports returning values', function () {
    var src = addWith('obj || {}', 'return foo')
    outputs.push(src)
    // obj.bar = obj.foo
    var obj = {
        foo: 'ding'
      }
    assert(Function('obj', src)(obj) === 'ding')
  })
  it('supports returning without argument', function () {
    var src = addWith('obj || {}', 'return; return foo')
    outputs.push(src)
    var obj = {
      foo: 'ding'
    }
    assert(Function('obj', src + 'throw new Error("but we returned")')(obj) === undefined)
  })
  it('supports returning undefined', function () {
    var src = addWith('obj || {}', 'return foo')
    outputs.push(src)
    assert(Function('obj', src + ';return "ding"')({}) === undefined)
  })
  it('supports not actually returning', function () {
    var src = addWith('obj || {}', 'if (false) return foo')
    outputs.push(src)
    assert(Function('obj', src + ';return "ding"')({}) === 'ding')
  })
  it('supports returning in a child function', function () {
    var src = addWith('obj || {}', 'var a = function () { return foo; }; return a()')
    outputs.push(src)
    var obj = {
      foo: 'ding'
    }
    assert(Function('obj', src + ';throw new Error("but we returned")')(obj) === 'ding')
  })
})

describe('addWith("obj || {}", "return foo, bar")', function () {
  it('returns bar', function () {
    var src = addWith('obj || {}', 'return foo, bar')
    outputs.push(src)
    var obj = {
      foo: 'ding',
      bar: 'dong',
    }
    assert(Function('obj', src)(obj) === 'dong')
  })
})

describe('addWith("obj || {}", "return this[foo]")', function () {
  it('keeps reference to this', function () {
    var src = addWith('obj || {}', 'return this[foo]')
    outputs.push(src)
    // obj.bar = obj.foo
    var obj = {
        foo: 'bar',
        bar: 'ding',
        fn: Function('obj', src)
      }
    assert(obj.fn(obj) === 'ding')
  })

  it('does not pass `undefined` as an argument', function () {
    var src = addWith('obj || {}', 'return this[foo]')
    assert(!~src.indexOf('"undefined" in locals_for_with'))
    assert(!~src.indexOf('locals_for_with.undefined'))
    assert(!~src.indexOf('typeof undefined!=="undefined"?undefined:undefined'))
    outputs.push(src)
  })
})
describe('addWith("obj", "var x = (y) => y + z; x(10);")', function () {
  it('keeps reference to this', function () {
    var src = addWith('obj', 'var x = (y) => y + z; x(10);')
    outputs.push(src)
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

describe('with JS syntax error', function () {
  function spec(obj, body, assertions) {
    it('exposes error location information', function () {
      var {result, error} = tryCatch(function () {
        return addWith(obj, body);
      })
      assert(result === 'threw')
      assertions(error)
    })
  }
  describe('in the obj', function () {
    spec('syntax error', '1 + 1;', function (error) {
      assert(error.component === 'obj')
      assert(error.babylonError.pos === 7)
    })
  })
  describe('in the body', function () {
    spec('1 + 1', 'syntax error', function (error) {
      assert(error.component === 'src')
      assert(error.babylonError.pos === 7)
    })
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
