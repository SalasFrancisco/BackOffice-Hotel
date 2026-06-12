type ServiceCategoryOrderable = {
  id: number;
  nombre: string;
  orden?: number | null;
};

type ServiceOrderable = {
  id: number;
  nombre: string;
};

const compareNames = (nameA: string, nameB: string) =>
  nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });

export const sortServiceCategories = <T extends ServiceCategoryOrderable>(
  categories: T[],
) =>
  [...categories].sort((categoryA, categoryB) => {
    const orderA = Number(categoryA.orden);
    const orderB = Number(categoryB.orden);
    const hasOrderA = Number.isFinite(orderA) && orderA > 0;
    const hasOrderB = Number.isFinite(orderB) && orderB > 0;

    if (hasOrderA && hasOrderB && orderA !== orderB) {
      return orderA - orderB;
    }
    if (hasOrderA && !hasOrderB) return -1;
    if (!hasOrderA && hasOrderB) return 1;

    return compareNames(categoryA.nombre, categoryB.nombre)
      || categoryA.id - categoryB.id;
  });

export const sortServicesByName = <T extends ServiceOrderable>(services: T[]) =>
  [...services].sort(
    (serviceA, serviceB) =>
      compareNames(serviceA.nombre, serviceB.nombre)
      || serviceA.id - serviceB.id,
  );
