c = 2


class Calculator:
    def add(self, x, y):
        result = x + y
        return result

    def multiply(self, x, y):
        result = x * y
        return result

    def complex_calculation(self, a, b):
        intermediate_result = self.add(a, b)
        intermediate_result = self.add(intermediate_result, c)

        return intermediate_result
