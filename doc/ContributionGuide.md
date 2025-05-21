TS 简单命令行

进行编译 ： npm run compile
安装相关库 ： npm install

跑测试用里 (因为我们是vscode extension development环境， 有特定的执行测试用例的方法)

xvfb-run npm run test --testFile=exp.cpp  // run src/test/suite/exp.cpp.test.ts // testFile match reg see suite/index.ts 18-28

debugger 启动脚本参考 .vscode/launch.json
我一般都是用跑测试用例的方法来去跑实验（参考 exp.java.test.ts, exp.py.java.test.ts)


依赖分析

重要参数
symbol : 语言服务器定义的symbol，通常指function，class，
document ：指代码文件

代码分析流程 (参考 ContextSelector.ts)

查看 caller ：
- 首先利用 semanticTokenProvider api, 提取目标函数内部的所有 token (this.getAllTokens())
- 再次对这些token进行use-def relationship 建模 ( retreiveDef )
- 经过以上的步骤之后，每个token都会拿到 definition，definition会包括具体位置信息 （getSymbolByLocation）
- 这样的话，我们又拿到一个symbol了，
你可以反复上面的过程，这样就可以做multi-hop依赖分析了

查看 callee ：
- 调用 provideReferenceProvider接口 （参考 getReferenceInfo）
  

不用的文件夹 ：src/train, src/telemetry

额外功能 
- AST-CFG分析, 由于 LSP不支持，这个需要手动适配一下每个编程语言（预计需要1-2h包括验证）
- 具体可以参考 cfg/golang.ts, java.ts, path.ts, test/suite/*.cfg.test. ts, *.path.test.ts

预计会遇到的问题
- Semantic Tokenzier 不返回 token （这可能需要调整某个参数，python，java没有这个问题，但是go的话，需要在settings部分加点参数（参考readme））
  