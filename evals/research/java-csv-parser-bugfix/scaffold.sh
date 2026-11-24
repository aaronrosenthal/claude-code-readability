#!/usr/bin/env bash
set -euo pipefail
cat > '.gitignore' <<'EOF_FIXTURE'
out/
EOF_FIXTURE
mkdir -p 'src/main/java/com/acme/csv'
cat > 'src/main/java/com/acme/csv/CsvFormatException.java' <<'EOF_FIXTURE'
package com.acme.csv;

public final class CsvFormatException extends RuntimeException {
    private final int lineNumber;

    public CsvFormatException(String message, int lineNumber) {
        super("Line " + lineNumber + ": " + message);
        this.lineNumber = lineNumber;
    }

    public int lineNumber() {
        return lineNumber;
    }
}
EOF_FIXTURE
mkdir -p 'src/main/java/com/acme/csv'
cat > 'src/main/java/com/acme/csv/CsvReader.java' <<'EOF_FIXTURE'
package com.acme.csv;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.Reader;
import java.util.ArrayList;
import java.util.List;

/** Reads comma-separated records from the finance team's nightly exports. */
public final class CsvReader {
    private final BufferedReader in;

    public CsvReader(Reader reader) {
        this.in = new BufferedReader(reader);
    }

    // Blank lines are skipped; the exports pad the end of the file with them.
    public List<List<String>> readAll() throws IOException {
        List<List<String>> records = new ArrayList<>();
        int lineNumber = 0;
        String line;
        while ((line = in.readLine()) != null) {
            lineNumber++;
            if (line.isEmpty()) {
                continue;
            }
            records.add(parseLine(line, lineNumber));
        }
        return records;
    }

    private static List<String> parseLine(String line, int lineNumber) {
        List<String> fields = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') {
                if (!inQuotes && field.length() > 0) {
                    throw new CsvFormatException("Unexpected quote in unquoted field", lineNumber);
                }
                inQuotes = !inQuotes;
            } else if (c == ',' && !inQuotes) {
                fields.add(field.toString());
                field.setLength(0);
            } else {
                field.append(c);
            }
        }
        fields.add(field.toString());
        return fields;
    }
}
EOF_FIXTURE
mkdir -p 'src/main/java/com/acme/csv'
cat > 'src/main/java/com/acme/csv/CsvTable.java' <<'EOF_FIXTURE'
package com.acme.csv;

import java.io.IOException;
import java.io.Reader;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Reads a CSV file whose first record is a header row into one map per data row. */
public final class CsvTable {
    private CsvTable() {
    }

    public static List<Map<String, String>> read(Reader reader) throws IOException {
        List<List<String>> records = new CsvReader(reader).readAll();
        if (records.isEmpty()) {
            return List.of();
        }
        List<String> header = records.get(0);
        List<Map<String, String>> rows = new ArrayList<>();
        for (List<String> record : records.subList(1, records.size())) {
            if (record.size() != header.size()) {
                throw new IllegalArgumentException(
                        "Expected " + header.size() + " fields but found " + record.size());
            }
            Map<String, String> row = new LinkedHashMap<>();
            for (int i = 0; i < header.size(); i++) {
                row.put(header.get(i), record.get(i));
            }
            rows.add(row);
        }
        return rows;
    }
}
EOF_FIXTURE
mkdir -p 'src/test/java'
cat > 'src/test/java/TestRunner.java' <<'EOF_FIXTURE'
import com.acme.csv.CsvFormatException;
import com.acme.csv.CsvReader;
import com.acme.csv.CsvTable;
import java.io.IOException;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class TestRunner {
    private interface Body {
        void run() throws Exception;
    }

    private static final List<String> failures = new ArrayList<>();
    private static int count = 0;

    private static void test(String name, Body body) {
        count++;
        try {
            body.run();
        } catch (Throwable t) {
            failures.add(name + ": " + t);
        }
    }

    private static void assertEquals(Object expected, Object actual) {
        if (!Objects.equals(expected, actual)) {
            throw new AssertionError("expected " + expected + " but was " + actual);
        }
    }

    private static List<List<String>> parse(String text) throws IOException {
        return new CsvReader(new StringReader(text)).readAll();
    }

    public static void main(String[] args) {
        test("simple records", () ->
                assertEquals(List.of(List.of("a", "b", "c"), List.of("1", "2", "3")), parse("a,b,c\n1,2,3\n")));

        test("empty fields", () ->
                assertEquals(List.of(List.of("a", "", "c", "")), parse("a,,c,\n")));

        test("quoted field containing a comma", () ->
                assertEquals(List.of(List.of("Smith, Jo", "42")), parse("\"Smith, Jo\",42\n")));

        test("CRLF record separators", () ->
                assertEquals(List.of(List.of("a", "b"), List.of("c", "d")), parse("a,b\r\nc,d\r\n")));

        test("missing trailing newline", () ->
                assertEquals(List.of(List.of("a", "b")), parse("a,b")));

        test("blank lines are skipped", () ->
                assertEquals(List.of(List.of("a"), List.of("b")), parse("a\n\n\r\nb\n\n")));

        test("quoted empty field", () ->
                assertEquals(List.of(List.of("", "x")), parse("\"\",x\n")));

        test("escaped quote inside a quoted field", () ->
                assertEquals(List.of(List.of("say \"hi\" now", "ok")), parse("\"say \"\"hi\"\" now\",ok\n")));

        test("field that is only an escaped quote", () ->
                assertEquals(List.of(List.of("\"", "x")), parse("\"\"\"\",x\n")));

        test("escaped quotes at both edges of a field", () ->
                assertEquals(List.of(List.of("\"quoted\"")), parse("\"\"\"quoted\"\"\"\n")));

        test("LF inside a quoted field", () ->
                assertEquals(List.of(List.of("line one\nline two", "x")), parse("\"line one\nline two\",x\n")));

        test("CRLF inside a quoted field is preserved", () ->
                assertEquals(List.of(List.of("line one\r\nline two", "x")),
                        parse("\"line one\r\nline two\",x\r\n")));

        test("records after a multi-line field", () ->
                assertEquals(List.of(List.of("id", "note"), List.of("1", "a\r\nb"), List.of("2", "c")),
                        parse("id,note\r\n1,\"a\r\nb\"\r\n2,c\r\n")));

        test("blank line inside a quoted field is kept", () ->
                assertEquals(List.of(List.of("a\n\nb")), parse("\"a\n\nb\"\n")));

        test("stray quote in an unquoted field is rejected", () -> {
            try {
                parse("ab\"c,d\n");
                throw new AssertionError("expected CsvFormatException");
            } catch (CsvFormatException expected) {
                assertEquals(1, expected.lineNumber());
            }
        });

        test("error line number counts lines inside quoted fields", () -> {
            try {
                parse("a,b\n\"x\ny\",z\nq\"r,s\n");
                throw new AssertionError("expected CsvFormatException");
            } catch (CsvFormatException expected) {
                assertEquals(4, expected.lineNumber());
            }
        });

        test("table maps header names to values", () -> {
            List<Map<String, String>> rows = CsvTable.read(new StringReader("sku,note\nA1,\"5\"\" pipe\"\n"));
            assertEquals(List.of(Map.of("sku", "A1", "note", "5\" pipe")), rows);
        });

        test("table rejects rows with the wrong field count", () -> {
            try {
                CsvTable.read(new StringReader("a,b\n1\n"));
                throw new AssertionError("expected IllegalArgumentException");
            } catch (IllegalArgumentException expected) {
                assertEquals("Expected 2 fields but found 1", expected.getMessage());
            }
        });

        if (!failures.isEmpty()) {
            failures.forEach(failure -> System.out.println("FAIL " + failure));
            System.out.println(failures.size() + " of " + count + " TESTS FAILED");
            System.exit(1);
        }
        System.out.println("ALL " + count + " TESTS PASSED");
    }
}
EOF_FIXTURE
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
