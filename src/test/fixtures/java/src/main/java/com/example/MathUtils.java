package com.example;

/**
 * Math utility functions for testing LSP features.
 */
public class MathUtils {
    
    /**
     * Add two numbers.
     */
    public static int add(int a, int b) {
        return a + b;
    }
    
    /**
     * Multiply two numbers.
     */
    public static int multiply(int a, int b) {
        return a * b;
    }
    
    /**
     * Calculate sum of an array of numbers.
     */
    public static int calculateSum(int[] numbers) {
        int total = 0;
        for (int num : numbers) {
            total = add(total, num);
        }
        return total;
    }
}

