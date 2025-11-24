package com.example;

public class TestMultipleMissingImports {
    public void testMethod() {
        // Missing imports for ArrayList and HashMap
        ArrayList<String> list = new ArrayList<>();
        HashMap<String, Integer> map = new HashMap<>();
        list.add("test");
        map.put("key", 1);
    }
}
