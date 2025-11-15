package main

// Add two numbers
func Add(a int, b int) int {
	return a + b
}

// Multiply two numbers
func Multiply(a int, b int) int {
	return a * b
}

// CalculateSum calculates the sum of a slice of numbers
func CalculateSum(numbers []int) int {
	total := 0
	for _, num := range numbers {
		total = Add(total, num)
	}
	return total
}

