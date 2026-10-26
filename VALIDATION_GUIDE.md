# SplitSmart input validation guide

Validation is shared by the legacy-compatible screens through `src/legacy/validation.js`.

## Where validation is implemented

- `src/legacy/validation.js`: centralized validation rules, inline error rendering, focus handling, and file validation.
- `src/controller/appController.jsx`: calls validation before actions that save, advance the workflow, apply payer amounts, scan receipts, import backups, or generate claims.
- `src/styles/validation.css`: error text and invalid-field styling.
- `src/styles/index.css`: imports `validation.css`.

## Field-by-field validation map

| Screen     | Field                      | Validation                                                                         | Where the field is declared                                                 |
| ---------- | -------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Groups     | Member full name           | Required, trimmed, 2–60 characters, duplicate-name check                           | `src/legacy/components/Dialogs.jsx` (`name`, `data-validate="member-name"`) |
| Groups     | Member UPI ID              | Optional; if entered, must match a UPI ID format                                   | `src/legacy/components/Dialogs.jsx` (`upiId`, `data-validate="upi"`)        |
| Groups     | Group name / rename prompt | Required when supplied, 2–80 characters                                            | `src/controller/appController.jsx` (`create-group`, `rename-group`)         |
| Groups     | Member search              | Optional, maximum 60 characters                                                    | `src/legacy/views/GroupsView.jsx` (`data-validate="optional-text"`)         |
| Groups     | Primary payer              | Must match a member option in the selected group                                   | `src/legacy/views/GroupsView.jsx` (`data-validate="primary-payer"`)         |
| Groups     | JSON backup                | `.json`/JSON MIME type, maximum 10 MB, JSON parsing on import                      | `src/legacy/views/GroupsView.jsx` and `src/controller/appController.jsx`    |
| Bill       | Item name                  | Required, 2–100 characters                                                         | `src/legacy/views/BillView.jsx` (`data-field="name"`)                       |
| Bill       | Item quantity              | Required, finite, greater than 0 and no more than 9,999                            | `src/legacy/views/BillView.jsx` (`data-field="quantity"`)                   |
| Bill       | Item unit price            | Required, non-negative, maximum ₹99,999,999.99, two-decimal precision              | `src/legacy/views/BillView.jsx` (`data-field="unitPrice"`)                  |
| Bill       | Item dietary category      | Must be `ANY`, `VEG`, or `NON-VEG`                                                 | `src/legacy/views/BillView.jsx` (`data-field="category"`)                   |
| Bill       | Restaurant / outing name   | Optional; if entered, at least 2 and at most 100 characters                        | `src/legacy/views/BillView.jsx` (`bill-restaurant`)                         |
| Bill       | Date                       | Required valid date                                                                | `src/legacy/views/BillView.jsx` (`bill-date`)                               |
| Bill       | Notes                      | Optional, maximum 300 characters                                                   | `src/legacy/views/BillView.jsx` (`bill-notes`)                              |
| Bill       | CGST, SGST, service charge | Optional, non-negative amount with two-decimal precision                           | `src/legacy/views/BillView.jsx` (`tax-cgst`, `tax-sgst`, `tax-sc`)          |
| Bill       | Discount                   | Non-negative amount; cannot exceed item subtotal plus taxes/service charge         | `src/legacy/views/BillView.jsx` (`bill-discount`) and `validation.js`       |
| Bill       | Stated receipt total       | Optional, non-negative amount with two-decimal precision                           | `src/legacy/views/BillView.jsx` (`stated-total`)                            |
| Bill       | Receipt image              | Must be an image and no larger than 15 MB                                          | `src/legacy/views/BillView.jsx` and `src/controller/appController.jsx`      |
| Assignment | Natural-language command   | Required, trimmed, maximum 300 characters                                          | `src/legacy/views/AssignmentView.jsx` (`command-input`)                     |
| Assignment | Member search              | Optional, maximum 60 characters                                                    | `src/legacy/views/AssignmentView.jsx` (`assign-member-search`)              |
| Breakdown  | Payer amount               | Required non-negative amount; all payer amounts together must equal the bill total | `src/legacy/views/BreakdownView.jsx` and `src/controller/appController.jsx` |
| Settings   | Gemini API key             | Optional; if entered, 20–200 alphanumeric/underscore/hyphen characters             | `src/legacy/views/SettingsView.jsx` (`gemini-key-input`)                    |
| Settings   | Model preference           | Must match one of the available model values                                       | `src/legacy/views/SettingsView.jsx` (`gemini-model-select`)                 |
| Claim      | Claimant name              | Required selection                                                                 | `src/legacy/views/ClaimView.jsx` (`claimant-name-select`)                   |
| Claim      | Claimed items              | At least one item must be selected                                                 | `src/legacy/views/ClaimView.jsx` and `src/controller/appController.jsx`     |

Search and filter inputs are optional and allow empty values. They are limited to 60 characters so long pasted values do not overload the filter. The save-key checkbox is a boolean preference and does not need value validation. The hidden member ID and read-only share-link field are not editable user input. Claim-item checkboxes are validated as a group: at least one must be selected before the claim is generated.

## Validation behavior

- Errors appear inline when a user leaves a field and update as the field is corrected.
- Important actions validate again before changing screens or saving data. This prevents bypassing a field check by clicking a button directly.
- Browser-native constraints (`required`, `min`, `max`, `step`, `maxlength`, and `pattern`) are combined with custom application rules.
- File inputs are validated both when a file is selected and immediately before processing it.
- A payer total mismatch is treated as a group-level error; the amounts are not committed until they exactly match the bill total.
