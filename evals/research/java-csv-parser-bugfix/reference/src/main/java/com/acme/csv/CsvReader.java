package com.acme.csv;

import java.io.IOException;
import java.io.PushbackReader;
import java.io.Reader;
import java.util.ArrayList;
import java.util.List;

/** Reads comma-separated records from the finance team's nightly exports. */
public final class CsvReader {
    private static final int END_OF_INPUT = -1;

    private final PushbackReader in;
    private int lineNumber = 1;

    public CsvReader(Reader reader) {
        this.in = new PushbackReader(reader, 1);
    }

    // Blank lines are skipped; the exports pad the end of the file with them.
    public List<List<String>> readAll() throws IOException {
        List<List<String>> records = new ArrayList<>();
        while (hasMoreInput()) {
            List<String> record = readRecord();
            if (!record.isEmpty()) {
                records.add(record);
            }
        }
        return records;
    }

    private boolean hasMoreInput() throws IOException {
        int next = in.read();
        if (next == END_OF_INPUT) {
            return false;
        }
        in.unread(next);
        return true;
    }

    /** Returns an empty list for a blank line. */
    private List<String> readRecord() throws IOException {
        List<String> fields = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean inQuotes = false;
        boolean blank = true;

        int c;
        while ((c = in.read()) != END_OF_INPUT) {
            if (inQuotes) {
                if (c != '"') {
                    if (c == '\n') {
                        lineNumber++;
                    }
                    field.append((char) c);
                } else if (consumeIfNext('"')) {
                    field.append('"');
                } else {
                    inQuotes = false;
                }
                continue;
            }

            if (c == '\n' || (c == '\r' && consumeIfNext('\n'))) {
                lineNumber++;
                break;
            }
            blank = false;
            if (c == '"') {
                if (field.length() > 0) {
                    throw new CsvFormatException("Unexpected quote in unquoted field", lineNumber);
                }
                inQuotes = true;
            } else if (c == ',') {
                fields.add(field.toString());
                field.setLength(0);
            } else {
                field.append((char) c);
            }
        }
        if (inQuotes) {
            throw new CsvFormatException("Unterminated quoted field", lineNumber);
        }
        if (!blank) {
            fields.add(field.toString());
        }
        return fields;
    }

    private boolean consumeIfNext(char expected) throws IOException {
        int next = in.read();
        if (next == expected) {
            return true;
        }
        if (next != END_OF_INPUT) {
            in.unread(next);
        }
        return false;
    }
}
