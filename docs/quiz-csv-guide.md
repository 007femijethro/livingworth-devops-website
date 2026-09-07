# Livingworth Academy Quiz CSV Guide

This guide explains how a mentor can prepare and upload quiz questions to the Livingworth Academy portal using a CSV file.

## What the CSV importer supports

The CSV importer currently supports **single-answer multiple-choice questions** only. Every question must contain:

1. One question
2. Four answer options
3. The number of the correct option: `1`, `2`, `3`, or `4`

True/False, multiple-selection and typed-answer questions can be created manually in the portal, but they cannot currently be imported with CSV.

## Required column order

Use these six columns in this exact order:

| Column | Heading | What to enter |
| --- | --- | --- |
| A | Question | The complete question |
| B | Option 1 | First possible answer |
| C | Option 2 | Second possible answer |
| D | Option 3 | Third possible answer |
| E | Option 4 | Fourth possible answer |
| F | Correct Answer | The number `1`, `2`, `3`, or `4` |

The value in **Correct Answer** refers to the option position, not the answer text.

For example, if Option 3 is the correct answer, enter `3` in the Correct Answer column.

## Example

```csv
Question,Option 1,Option 2,Option 3,Option 4,Correct Answer
What does CI stand for?,Continuous Integration,Cloud Infrastructure,Code Inspection,Continuous Installation,1
Which command displays the current Git branch?,git branch,git push,git clone,git init,1
Which Docker command lists running containers?,docker build,docker ps,docker pull,docker images,2
```

## How to create the file in Excel or Google Sheets

1. Open Microsoft Excel or Google Sheets.
2. Create the six headings shown above in the first row.
3. Add one question per row.
4. Fill in all four answer options for every question.
5. Enter only `1`, `2`, `3`, or `4` in the Correct Answer column.
6. Review the answers carefully.
7. Export or download the spreadsheet as a **Comma-separated values (.csv)** file.

In Google Sheets, use **File → Download → Comma-separated values (.csv)**.

In Excel, use **File → Save As → CSV UTF-8 (Comma delimited) (.csv)**.

## How to upload the CSV

1. Sign in through the Staff portal.
2. Open **Live quiz**.
3. Open the quiz creation area.
4. Enter the quiz title.
5. Select the learning material the quiz assesses. This is required and determines the topic used in performance reports.
6. Choose the time allowed for each question. The accepted range is 5–300 seconds.
7. Choose **Manual** or **Automatic** navigation.
8. Under **Import questions from CSV**, click **Choose CSV**.
9. Select the completed `.csv` file.
10. Wait for the success message and quiz join code.

Questions are shown in the same order in which they appear in the CSV.

## Writing questions containing commas

If a question or option contains a comma, spreadsheet software normally adds quotation marks automatically when exporting. If you create the file manually, wrap that field in double quotes.

```csv
"Which tools are used for source control, collaboration and pull requests?",Git and GitHub,Docker and Kubernetes,Prometheus and Grafana,Ansible and Terraform,1
```

To include a quotation mark inside a quoted field, write it twice. For example:

```csv
"What does the message ""permission denied"" usually indicate?",A permissions problem,A DNS problem,A syntax theme,A Docker image tag,1
```

## Validation rules

- The file must contain at least one question.
- Every non-empty row must contain the question, four options and a correct-answer number.
- The question and all four options must not be empty.
- Correct Answer must be `1`, `2`, `3`, or `4`.
- The first row may contain headings. The importer recognises a heading when its first cell contains the word `Question`.
- Completely blank rows are ignored.
- The maximum upload size is 2 MB.
- A learning material must be selected before upload.

## Common errors and fixes

### “CSV row must contain question, four options and correct answer”

The affected row does not have all six required columns. Check for a missing question, option or comma separator.

### “Correct answer must be 1, 2, 3 or 4”

The last column contains answer text, a letter such as `A`, or a number outside the supported range. Replace it with the correct option number.

### “Question is incomplete”

The question or one of its four options is empty.

### “Choose the learning material this quiz assesses”

Select a learning material in the quiz form before choosing the CSV file.

### Commas split a question into extra columns

Create the file in Excel or Google Sheets and export it as CSV, or wrap fields containing commas in double quotation marks.

## Final checklist

Before uploading, confirm that:

- Every row has six completed columns.
- Every question has four distinct and believable options.
- Every correct answer is a number from 1 to 4.
- The answer number matches the correct option position.
- The file is saved as `.csv`, preferably CSV UTF-8.
- The correct learning material is selected in the portal.

