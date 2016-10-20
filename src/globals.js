import {ancestor as walk} from 'babylon-walk';
import * as t from 'babel-types';
import isReferenced from './reference.js';

const isScope = t.isFunctionParent;
const isBlockScope = node => t.isBlockStatement(node) || isScope(node);

const declaresArguments = node => t.isFunction(node) && !t.isArrowFunctionExpression(node);
const declaresThis = declaresArguments;

const LOCALS_SYMBOL = Symbol('locals');
const declareLocal = node => node[LOCALS_SYMBOL] = node[LOCALS_SYMBOL] || new Set();
const setLocal = (node, name) => declareLocal(node).add(name);

// First pass

function declareFunction(node) {
  for (let param of node.params) {
    declarePattern(param, node);
  }
  if (node.id) {
    setLocal(node, node.id.name);
  }
}

function declarePattern(node, parent) {
  switch (node.type) {
    case 'Identifier':
      setLocal(parent, node.name);
      break;
    case 'ObjectPattern':
      for (let prop of node.properties) {
        declarePattern(prop.value, parent);
      }
      break;
    case 'ArrayPattern':
      for (let element of node.elements) {
        if (element) declarePattern(element, parent);
      }
      break;
    case 'RestElement':
      declarePattern(node.argument, parent);
      break;
    case 'AssignmentPattern':
      declarePattern(node.left, parent);
      break;
    // istanbul ignore next
    default:
      throw new Error('Unrecognized pattern type: ' + node.type);
  }
}

function declareModuleSpecifier(node, state, parents) {
  setLocal(parents[1], node.local.name);
}

const firstPass = {
  VariableDeclaration(node, state, parents) {
    let parent;
    for (let i = parents.length - 2; i >= 0 && !parent; i--) {
      if (node.kind === 'var' ? t.isFunctionParent(parents[i]) : isBlockScope(parents[i])) {
        parent = parents[i];
      }
    }
    for (let declaration of node.declarations) {
      declarePattern(declaration.id, parent);
    }
  },
  FunctionDeclaration(node, state, parents) {
    let parent;
    for (let i = parents.length - 2; i >= 0 && !parent; i--) {
      if (isScope(parents[i])) {
        parent = parents[i];
      }
    }
    setLocal(parent, node.id.name);
    declareFunction(node);
  },
  Function: declareFunction,
  ClassDeclaration(node, state, parents) {
    let parent;
    for (let i = parents.length - 2; i >= 0 && !parent; i--) {
      if (isScope(parents[i])) {
        parent = parents[i];
      }
    }
    setLocal(parent, node.id.name);
  },
  TryStatement(node) {
    if (node.handler === null) return;
    setLocal(node.handler, node.handler.param.name);
  },
  ImportDefaultSpecifier: declareModuleSpecifier,
  ImportSpecifier: declareModuleSpecifier,
  ImportNamespaceSpecifier: declareModuleSpecifier
};

// Second pass

const secondPass = {
  Identifier(node, state, parents) {
    let name = node.name;
    if (name === 'undefined') return;

    const lastParent = parents[parents.length - 2];
    if (lastParent) {
      if (!isReferenced(node, lastParent)) return;

      let parent;
      for (let parent of parents) {
        if (name === 'arguments' && declaresArguments(parent)) {
          return;
        }
        if (parent[LOCALS_SYMBOL] && parent[LOCALS_SYMBOL].has(name)) {
          return;
        }
      }
    }
    state.globals.push(node);
  },
  ThisExpression(node, state, parents) {
    for (let parent of parents) {
      if (declaresThis(parents)) {
        return;
      }
    }
    state.globals.push(node);
  }
}

export default function findGlobals(ast) {
  const globals = [];
  // istanbul ignore if
  if (!t.isNode(ast)) {
    throw new TypeError('Source must be a Babylon AST');
  }
  walk(ast, firstPass);
  walk(ast, secondPass, { globals });
  const groupedGlobals = Object.create(null);
  for (let node of globals) {
    let name = node.type === 'ThisExpression' ? 'this' : node.name;
    groupedGlobals[name] = groupedGlobals[name] || [];
    groupedGlobals[name].push(node);
  }
  return Object.keys(groupedGlobals).sort().map(name => ({name, nodes: groupedGlobals[name]}));
}
