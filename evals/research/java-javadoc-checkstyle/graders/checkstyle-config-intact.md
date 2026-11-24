---
type: regex
target: { source: file, path: checkstyle.xml }
pattern: '<module name="MissingJavadocType">\s*<property name="scope" value="public"/>\s*</module>\s*<module name="MissingJavadocMethod">\s*<property name="scope" value="public"/>\s*</module>\s*<module name="JavadocMethod"/>'
---
