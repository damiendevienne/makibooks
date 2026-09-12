/**
 * Loans are managed by the loan workflow, never from the book editor.
 * Strapi's admin editor can include an empty `loans` relation in an otherwise
 * unrelated book update; ignoring that field preserves active and historical
 * loan links (and therefore their conversations).
 */
export default {
  beforeCreate(event) {
    if (event.params?.data) delete event.params.data.loans;
  },
  beforeUpdate(event) {
    if (event.params?.data) delete event.params.data.loans;
  },
};
