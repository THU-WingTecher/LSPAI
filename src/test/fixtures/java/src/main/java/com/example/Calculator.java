package com.example;

/**
 * A simple calculator class that uses MathUtils functions.
 */
public class Calculator {
    private int result;
    
    public Calculator() {
        this.result = 0;
    }
    
    /**
     * Perform a computation using MathUtils functions.
     */
    public int compute(String operation, int a, int b) {
        if ("add".equals(operation)) {
            this.result = MathUtils.add(a, b);
        } else if ("multiply".equals(operation)) {
            this.result = MathUtils.multiply(a, b);
        }
        return this.result;
    }
    
    /**
     * Sum an array of numbers.
     */
    public int sumArray(int[] numbers) {
        return MathUtils.calculateSum(numbers);
    }
}

