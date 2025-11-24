package com.example;

public class TestMissingImport {
    public void testMethod() {
        // Missing import for ArrayList
        ArrayList<String> list = new ArrayList<>();
        list.add("test");
    }
}
