-- Fix R2 public URLs from API endpoint to public access domain
update public.posts
  set image_url = replace(
    image_url,
    'https://8a5bdd1c1472ea7b9092b4930657f93d.r2.cloudflarestorage.com',
    'https://pub-e929d922ccb844f08a8b0edd6450d637.r2.dev'
  )
  where image_url like '%8a5bdd1c1472ea7b9092b4930657f93d.r2.cloudflarestorage.com%';

update public.brand_profiles
  set logo_url = replace(
    logo_url,
    'https://8a5bdd1c1472ea7b9092b4930657f93d.r2.cloudflarestorage.com',
    'https://pub-e929d922ccb844f08a8b0edd6450d637.r2.dev'
  )
  where logo_url like '%8a5bdd1c1472ea7b9092b4930657f93d.r2.cloudflarestorage.com%';

update public.media_assets
  set file_url = replace(
    file_url,
    'https://8a5bdd1c1472ea7b9092b4930657f93d.r2.cloudflarestorage.com',
    'https://pub-e929d922ccb844f08a8b0edd6450d637.r2.dev'
  )
  where file_url like '%8a5bdd1c1472ea7b9092b4930657f93d.r2.cloudflarestorage.com%';
