package sample

import "testing"

// TestSimpleFail intentionally fails for testing
func TestSimpleFail(t *testing.T) {
	if 1+1 != 3 {
		t.Error("Expected 1+1 to equal 3 (this is intentional failure)")
	}
}

// TestPanic intentionally panics for testing
func TestPanic(t *testing.T) {
	panic("intentional panic for testing")
}

// TestExpectedFailure tests failure handling
func TestExpectedFailure(t *testing.T) {
	expected := "foo"
	actual := "bar"
	if expected != actual {
		t.Errorf("Expected '%s' but got '%s'", expected, actual)
	}
}
