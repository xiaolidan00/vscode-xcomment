import * as vscode from 'vscode';
import * as ts from 'typescript';

export class AddCommentController {
  editor: vscode.TextEditor;
  sourceLines: Array<[number, number, string]> = [];
  comment: string = '';
  constructor(editor: vscode.TextEditor) {
    this.editor = editor;
  }
  clearAll() {
    this.sourceLines = [];
  }
  getSourceLines(code: string) {
    const list: Array<[number, number, string]> = [];
    const lines = code.split('\n');
    if (lines.length) {
      let pre = 0;
      lines.forEach((line, idx) => {
        //+idx是因为换行号也算一个字符，需要加上
        list.push([pre + idx, pre + idx + line.length, line]);
        pre += line.length;
      });
    }
    return list;
  }
  findNode(file: ts.SourceFile, pos: number) {
    let result: ts.Node[] = [];
    const visitNode = (node: ts.Node) => {
      try {
        ts.forEachChild(node, (child) => {
          if (pos >= child.getStart() && pos < child.getEnd()) {
            result.push(child);
            //深度遍历子节点
            visitNode(child);
            //跳出循环
            throw Error();
          }
        });
      } catch (error) {}
    };

    for (let i = 0; i < file.statements.length; i++) {
      const it = file.statements[i];
      if (pos >= it.getStart() && pos < it.getEnd()) {
        result.push(it);
        //深度遍历子节点
        visitNode(it);
        break;
      }
    }
    return result;
  }
  checkDocs(node: ts.Node, sourceFile: ts.SourceFile, cb: (msg?: string[]) => void) {
    //@ts-ignore
    if (node.jsDoc && node.jsDoc.length > 0) {
      //有jsDoc就不添加注释
    } else {
      const comments: string[] = [];
      //头部注释
      const leadingComments = ts.getLeadingCommentRanges(sourceFile.text, node.pos);
      if (leadingComments) {
        leadingComments.forEach((comment) => {
          const s = sourceFile.text.substring(comment.pos, comment.end);
          comments.push(s.replace(/[\*\/]+/g, ''));
        });
      }
      //尾部注释
      const tailingComments = ts.getTrailingCommentRanges(sourceFile.text, node.end);
      if (tailingComments) {
        tailingComments.forEach((comment) => {
          const s = sourceFile.text.substring(comment.pos, comment.end);
          comments.push(s.replace(/[\*\/]+/g, ''));
        });
      }

      if (comments && comments.length > 0) {
        //将旧的注释添加到jsDoc内
        cb(comments);
      } else {
        //添加新的注释
        cb();
      }
    }
  }
  addNodeComment(node: ts.Node, comments: string[]) {
    const c = '/**' + comments.join('\n') + '*/';

    this.comment = c;
  }
  getFunComments(
    stmt:
      | ts.FunctionDeclaration
      | ts.MethodDeclaration
      | ts.ArrowFunction
      | ts.FunctionExpression
      | ts.ConstructorDeclaration
      | ts.MethodSignature
  ): string[] {
    const comments: string[] = [];

    //参数
    if (stmt.parameters) {
      stmt.parameters.forEach((param) => {
        comments.push(
          ` * @param ${param.type ? `{${param.type.getText().replace(/\s/g, '')}}` : '{any}'} ${param.name.getText().replace(/\s/g, '')} - description`
        );
      });
    }
    //返回值
    if (!ts.isConstructorDeclaration(stmt) && stmt.type && stmt.type.kind !== ts.SyntaxKind.VoidKeyword) {
      comments.push(` * @returns {${stmt.type.getText().replace(/\s/g, '') || 'any'}} description`);
    }
    return comments;
  }
  addDocProp(prop: ts.Node) {
    return (msg?: string[]) => {
      const comments = this.getNodeName(prop, msg);

      this.addNodeComment(prop, comments);
    };
  }
  getNodeName(stmt: ts.Node, msg?: string[]) {
    const comments: string[] = [];
    if (msg) {
      msg.forEach((a) => {
        if (!/^\s+$/.test(a)) {
          comments.push(' * ' + a);
        }
      });
    }
    if (comments.length === 0) {
      //获取父级节点名称
      let current: ts.Node = stmt;
      while (current) {
        //@ts-ignore
        let name = stmt.name;
        if (name) {
          const n = name.getText();
          if (!/^\s+$/.test(n)) {
            comments.push(' * ' + n);
            break;
          }
        }
        current = current.parent;
      }
    }
    //如果父级没有名称则添加默认注释
    if (comments.length === 0) {
      comments.push(` * description`);
    }
    return comments;
  }
  addDocFun(stmt: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ConstructorDeclaration | ts.MethodSignature) {
    return (msg?: string[]) => {
      const comments = this.getNodeName(stmt, msg);

      comments.push(...this.getFunComments(stmt));
      this.addNodeComment(stmt, comments);
    };
  }
  addInitializerDoc(stmt: ts.Node, initializer: ts.FunctionExpression | ts.ArrowFunction) {
    return (msg?: string[]) => {
      const comments = this.getNodeName(initializer, msg);

      comments.push(...this.getFunComments(initializer));

      this.addNodeComment(stmt, comments);
    };
  }

  addComment(sourceFile: ts.SourceFile, nodes: ts.Node[]) {
    if (nodes.length) {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const stmt = nodes[i];
        if (
          ts.isVariableStatement(stmt) &&
          stmt.declarationList &&
          ts.isVariableDeclarationList(stmt.declarationList) &&
          stmt.declarationList.declarations.length
        ) {
          const declaration = stmt.declarationList.declarations[0];
          if (
            ts.isVariableDeclaration(declaration) &&
            declaration.initializer &&
            (ts.isFunctionExpression(declaration.initializer) || ts.isArrowFunction(declaration.initializer))
          ) {
            this.checkDocs(declaration, sourceFile, this.addInitializerDoc(stmt, declaration.initializer));
            return;
          } else if (
            ts.isVariableDeclaration(declaration) &&
            declaration.initializer &&
            ts.isCallExpression(declaration.initializer)
          ) {
            this.checkDocs(stmt, sourceFile, this.addDocProp(stmt));
            return;
          }
        } else if (
          (ts.isPropertyAssignment(stmt) || ts.isPropertyDeclaration(stmt)) &&
          stmt.initializer &&
          (ts.isFunctionExpression(stmt.initializer) || ts.isArrowFunction(stmt.initializer))
        ) {
          this.checkDocs(stmt, sourceFile, this.addInitializerDoc(stmt, stmt.initializer));
          return;
        } else if (
          ts.isFunctionDeclaration(stmt) ||
          ts.isMethodDeclaration(stmt) ||
          ts.isMethodSignature(stmt) ||
          ts.isConstructorDeclaration(stmt)
        ) {
          this.checkDocs(stmt, sourceFile, this.addDocFun(stmt));
          return;
        } else if (ts.isInterfaceDeclaration(stmt) || ts.isClassDeclaration(stmt)) {
          this.checkDocs(stmt, sourceFile, this.addDocProp(stmt));
          return;
        } else if (ts.isTypeAliasDeclaration(stmt) && stmt.type && ts.isTypeLiteralNode(stmt.type)) {
          this.checkDocs(stmt, sourceFile, this.addDocProp(stmt));
          return;
        } else if (ts.isPropertyDeclaration(stmt) || ts.isPropertySignature(stmt) || ts.isPropertyAssignment(stmt)) {
          this.checkDocs(stmt, sourceFile, this.addDocProp(stmt));
          return;
        }
      }
      //其他节点添加注释
      const stmt = nodes[nodes.length - 1];
      this.checkDocs(stmt, sourceFile, this.addDocProp(stmt));
    }
  }

  doAction() {
    const doc = this.editor.document;
    const fileName = doc.fileName; //文件绝对路径
    const code = doc.getText(); //代码内容
    this.sourceLines = this.getSourceLines(code);
    //是否有光标
    if (!this.editor.selection.active) {
      return;
    }
    const pos = this.editor.selection.active.line;
    const item = this.sourceLines[pos];
    //判断光标范围在文档代码有效范围内
    if (!item) {
      return;
    }

    //光标具体所在代码的字符索引位置
    const p = item[0] + this.editor.selection.active.character;

    if (fileName.endsWith('.vue')) {
      let startIndex = code.indexOf('<script');
      let endIndex = code.indexOf('</script>');
      if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
        return;
      }
      for (let i = startIndex; i < endIndex; i++) {
        const c = code[i];
        if (c === '>') {
          startIndex = i + 1;
          break;
        }
      }

      if (p < startIndex || p > endIndex) {
        vscode.window.showInformationMessage('vue文件光标位置不在js/ts范围内');
        return;
      }
      //vue文件内js/ts代码
      const script = code.substring(startIndex, endIndex);
      const sourceFile = ts.createSourceFile(fileName, script, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
      const currentNodes = this.findNode(sourceFile, p - startIndex);
      this.addComment(sourceFile, currentNodes);
    } else {
      const sourceFile = ts.createSourceFile(fileName, code, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);

      const currentNodes = this.findNode(sourceFile, p);
      this.addComment(sourceFile, currentNodes);
    }

    //该行内容
    const linestr = this.sourceLines[pos][2];
    if (/^\s*$/.test(linestr)) {
      //如果全是空白字符则直接插入
      this.editor.edit((editBuilder) => {
        editBuilder.insert(this.editor.selection.active, this.comment);
      });
    } else {
      //非空白字符，按照当行前面空格位置插入
      const spaces: string[] = [];
      for (let i = 0; i < linestr.length; i++) {
        if (/\s/.test(linestr[i])) {
          spaces.push(linestr[i]);
        } else {
          break;
        }
      }
      this.editor.edit((editBuilder) => {
        editBuilder.insert(new vscode.Position(pos, 0), spaces.join('') + this.comment + '\n');
      });
    }
  }
}
