package sample

import "testing"

// TestSimplePass tests basic arithmetic
func TestSimplePass(t *testing.T) {
	if 1+1 != 2 {
		t.Error("Math is broken")
	}
}

// TestAnotherPass tests boolean logic
func TestAnotherPass(t *testing.T) {
	result := true
	if !result {
		t.Fatal("Expected true")
	}
}

// TestStringComparison tests string operations
func TestStringComparison(t *testing.T) {
	str := "hello"
	if str != "hello" {
		t.Errorf("Expected 'hello', got '%s'", str)
	}
}
