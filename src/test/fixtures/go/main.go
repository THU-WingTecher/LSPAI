package main

import "fmt"

func main() {
	calc := NewCalculator()
	result1 := calc.Compute("add", 5, 3)
	result2 := calc.Compute("multiply", 4, 7)
	numbers := []int{1, 2, 3, 4, 5}
	result3 := calc.SumSlice(numbers)
	fmt.Printf("Add result: %d\n", result1)
	fmt.Printf("Multiply result: %d\n", result2)
	fmt.Printf("Sum slice result: %d\n", result3)
}


