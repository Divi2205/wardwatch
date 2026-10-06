// Small reusable hooks
import { useEffect, useState } from 'react';
import { api } from './api';

// Loads the category list once (code, label, target hours)
export function useCategories() {
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    api('/api/issues/categories').then((d) => setCategories(d.categories)).catch(() => {});
  }, []);
  return categories;
}
