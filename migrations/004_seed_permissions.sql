-- El seed de roles/permisos y el usuario admin se aplican por código (seedRbacAndAdmin),
-- para poder hashear la contraseña con scrypt. Este archivo queda como marcador/orden.
-- En producción: ejecutar una vez `node -e "import('./src/app.js').then(async m=>{...seedRbacAndAdmin...})"`.
SELECT 1;
