import {parse} from 'babylon';
import {recursive as walk} from 'babylon-walk';
import * as t from 'babel-types';
import detect from './globals.js';

const includes = (array, searchElement, fromIndex) => Array.prototype.includes.call(array, searchElement, fromIndex);

const parseOptions = {
  allowReturnOutsideFunction: true,
  allowImportExportEverywhere: true
};

/**
 * Mimic `with` as far as possible but at compile time
 *
 * @param {String} obj The object part of a with expression
 * @param {String} src The body of the with expression
 * @param {Array.<String>} exclude A list of variable names to explicitly exclude
 */
export default function addWith(obj, src, exclude = []) {
  obj = obj + '';
  src = src + '';

  let ast;
  try {
    ast = parse(src, parseOptions);
  } catch(e) {
    throw Object.assign(new Error('Error parsing body of the with expression'), {
      component: 'src',
      babylonError: e
    });
  }
  let objAst;
  try {
    objAst = parse(obj, parseOptions);
  } catch(e) {
    throw Object.assign(new Error('Error parsing object part of the with expression'), {
      component: 'obj',
      babylonError: e
    });
  }
  exclude = new Set([
    'undefined',
    'this',
    ...exclude,
    ...detect(objAst).map(g => g.name)
  ]);

  const vars = new Set(
    detect(ast)
      .map(global => global.name)
      .filter(v => !exclude.has(v))
  );

  if (vars.size === 0) return src;

  let declareLocal = '';
  let local = 'locals_for_with';
  let result = 'result_of_with';
  if (t.isValidIdentifier(obj)) {
    local = obj;
  } else {
    while (vars.has(local) || exclude.has(local)) {
      local += '_';
    }
    declareLocal = `var ${local} = (${obj});`;
  }
  while (vars.has(result) || exclude.has(result)) {
    result += '_';
  }

  const args = [
    'this',
    ...Array.from(vars).map(v =>
      `${JSON.stringify(v)} in ${local} ?
        ${local}.${v} :
        typeof ${v} !== 'undefined' ? ${v} : undefined`
    )
  ];

  let unwrapped = unwrapReturns(ast, src, result);

  return `;
    ${declareLocal}
    ${unwrapped.before}
    (function (${Array.from(vars).join(', ')}) {
      ${unwrapped.body}
    }.call(${args.join(', ')}));
    ${unwrapped.after};`;
}

const unwrapReturnsVisitors = {
  Function(node, state, c) {
    // returns in these functions are not applicable
  },

  ReturnStatement(node, state) {
    state.hasReturn = true;
    let value = '';
    if (node.argument) {
      value = `value: (${state.source(node.argument)})`
    }
    state.replace(node, `return {${value}};`);
  }
};

/**
 * Take a self calling function, and unwrap it such that return inside the function
 * results in return outside the function
 *
 * @param {String} src    Some JavaScript code representing a self-calling function
 * @param {String} result A temporary variable to store the result in
 */
function unwrapReturns(ast, src, result) {
  const charArray = src.split('');

  const state = {
    hasReturn: false,
    source(node) {
      return src.slice(node.start, node.end);
    },
    replace(node, str) {
      charArray.fill('', node.start, node.end);
      charArray[node.start] = str;
    }
  };

  walk(ast, unwrapReturnsVisitors, state);

  return {
    before: state.hasReturn ? `var ${result} = ` : '',
    body: charArray.join(''),
    after: state.hasReturn ? `;if (${result}) return ${result}.value` : ''
  };
}
