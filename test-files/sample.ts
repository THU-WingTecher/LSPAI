/**
 * Sample TypeScript file for testing MCP server
 */

interface Person {
    name: string;
    age: number;
}

function greet(person: Person): string {
    return `Hello, ${person.name}! You are ${person.age} years old.`;
}

class Calculator {
    private result: number = 0;

    add(value: number): number {
        this.result += value;
        return this.result;
    }

    subtract(value: number): number {
        this.result -= value;
        return this.result;
    }

    getResult(): number {
        return this.result;
    }

    reset(): void {
        this.result = 0;
    }
}

function calculateSum(a: number, b: number): number {
    return a + b;
}

function main(): void {
    const person: Person = { name: "Alice", age: 30 };
    console.log(greet(person));

    const calc = new Calculator();
    calc.add(10);
    calc.add(5);
    console.log(`Result: ${calc.getResult()}`);

    const sum = calculateSum(10, 20);
    console.log(`Sum: ${sum}`);
}

main();



