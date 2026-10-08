import EditProduct from '../[id]/page';
export default function NewProduct() { return EditProduct({ params: Promise.resolve({ id: 'new' }) }); }
