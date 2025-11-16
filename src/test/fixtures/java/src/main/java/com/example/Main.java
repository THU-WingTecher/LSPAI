package com.example;

/**
 * Main entry point that uses Calculator.
 */
public class Main {
    public static void main(String[] args) {
        Calculator calc = new Calculator();
        int result1 = calc.compute("add", 5, 3);
        int result2 = calc.compute("multiply", 4, 7);
        int[] numbers = {1, 2, 3, 4, 5};
        int result3 = calc.sumArray(numbers);
        System.out.println("Add result: " + result1);
        System.out.println("Multiply result: " + result2);
        System.out.println("Sum array result: " + result3);
    }
}

