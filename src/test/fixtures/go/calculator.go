package main

// Calculator is a simple calculator struct
type Calculator struct {
	result int
}

// NewCalculator creates a new Calculator instance
func NewCalculator() *Calculator {
	return &Calculator{result: 0}
}

// Compute performs a computation using math_utils functions
func (c *Calculator) Compute(operation string, a int, b int) int {
	if operation == "add" {
		c.result = Add(a, b)
	} else if operation == "multiply" {
		c.result = Multiply(a, b)
	}
	return c.result
}

// SumSlice sums a slice of numbers
func (c *Calculator) SumSlice(numbers []int) int {
	return CalculateSum(numbers)
}

