import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { experiment } from './extension'; // Replace with the correct module path

// Check if required arguments are passed
const args = process.argv.slice(2);  // Get arguments passed to the script
const language = args[0]; // First argument is the language

if (!language) {
  console.error('Error: Please specify a language (e.g., "java")');
  process.exit(1);
}

// Run the experiment function with the provided language
async function runExperiment() {
  try {
    console.log(`Running experiment for language: ${language}`);
    const results = await experiment(language);
    console.log('Experiment Results:', results);
  } catch (error) {
    console.error('Error running experiment:', error);
    process.exit(1);
  }
}

runExperiment();
