   // src/cfg/builderFactory.ts
   import { SupportedLanguage } from '../ast';
   import { CFGBuilder } from './builder';
   import { PythonCFGBuilder } from './python';
   // import { CppCFGBuilder } from './cpp'; // and so on

   export function createCFGBuilder(language: SupportedLanguage): CFGBuilder {
       switch (language) {
           case 'python':
               return new PythonCFGBuilder(language);
           // case 'cpp':
           //     return new CppCFGBuilder(language);
           // Add more languages as needed
           default:
               throw new Error(`Unsupported language: ${language}`);
       }
   }