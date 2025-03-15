def calculate_fibonacci(n):
    if n <= 0:
        return []
    elif n == 1:
        return [0]
    
    fib = [0, 1]
    for i in range(2, n):
        fib.append(fib[i-1] + fib[i-2])
    return fib

def process_numbers(numbers):
    result = []
    i = 0
    
    while i < len(numbers):
        current = numbers[i]
        
        if current % 2 == 0:
            # Process even numbers
            j = i
            while j < len(numbers) and numbers[j] % 2 == 0:
                result.append(numbers[j] * 2)
                j += 1
            i = j
        else:
            # Process odd numbers
            if current > 10:
                result.append(current // 2)
            elif current < 5:
                result.append(current * 3)
            else:
                result.append(current)
            i += 1
    
    return result

def main():
    # Generate first 8 Fibonacci numbers
    fib_sequence = calculate_fibonacci(8)
    print("Fibonacci sequence:", fib_sequence)
    
    # Process the sequence
    processed = process_numbers(fib_sequence)
    print("Processed sequence:", processed)
    
    # Calculate sum with different conditions
    total = 0
    for num in processed:
        if num < 10:
            total += num
        elif 10 <= num <= 20:
            total += num * 2
        else:
            total += num // 2
    
    print("Final total:", total)

if __name__ == "__main__":
    main()