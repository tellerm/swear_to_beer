const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const iconPath = path.join(__dirname, '../swear_to_beer_icon.jpg');

// Android icon sizes
const androidSizes = [
  { folder: 'mipmap-mdpi', size: 48 },
  { folder: 'mipmap-hdpi', size: 72 },
  { folder: 'mipmap-xhdpi', size: 96 },
  { folder: 'mipmap-xxhdpi', size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 }
];

// iOS icon sizes (for AppIcon.appiconset)
const iosSizes = [
  { name: 'Icon-20@2x.png', size: 40 },
  { name: 'Icon-20@3x.png', size: 60 },
  { name: 'Icon-29@2x.png', size: 58 },
  { name: 'Icon-29@3x.png', size: 87 },
  { name: 'Icon-40@2x.png', size: 80 },
  { name: 'Icon-40@3x.png', size: 120 },
  { name: 'Icon-60@2x.png', size: 120 },
  { name: 'Icon-60@3x.png', size: 180 },
  { name: 'Icon-1024.png', size: 1024 }
];

async function generateAndroidIcons() {
  console.log('Generating Android icons...');

  for (const { folder, size } of androidSizes) {
    const dir = path.join(__dirname, 'android/app/src/main/res', folder);

    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Generate square icon with trim to remove padding and fill coverage
    await sharp(iconPath)
      .trim()
      .resize(size, size, {
        fit: 'cover',
        position: 'center'
      })
      .png()
      .toFile(path.join(dir, 'ic_launcher.png'));

    // Generate round icon with trim to remove padding and fill coverage
    await sharp(iconPath)
      .trim()
      .resize(size, size, {
        fit: 'cover',
        position: 'center'
      })
      .png()
      .toFile(path.join(dir, 'ic_launcher_round.png'));

    console.log(`Generated ${folder} icons (${size}x${size})`);
  }
}

async function generateIOSIcons() {
  console.log('Generating iOS icons...');

  const iosIconDir = path.join(__dirname, 'ios/MyMobileApp/Images.xcassets/AppIcon.appiconset');

  // Create directory if it doesn't exist
  if (!fs.existsSync(iosIconDir)) {
    fs.mkdirSync(iosIconDir, { recursive: true });
  }

  for (const { name, size } of iosSizes) {
    await sharp(iconPath)
      .trim()
      .resize(size, size, {
        fit: 'cover',
        position: 'center'
      })
      .png()
      .toFile(path.join(iosIconDir, name));

    console.log(`Generated ${name} (${size}x${size})`);
  }

  // Generate Contents.json for iOS
  const contentsJson = {
    "images": [
      {
        "size": "20x20",
        "idiom": "iphone",
        "filename": "Icon-20@2x.png",
        "scale": "2x"
      },
      {
        "size": "20x20",
        "idiom": "iphone",
        "filename": "Icon-20@3x.png",
        "scale": "3x"
      },
      {
        "size": "29x29",
        "idiom": "iphone",
        "filename": "Icon-29@2x.png",
        "scale": "2x"
      },
      {
        "size": "29x29",
        "idiom": "iphone",
        "filename": "Icon-29@3x.png",
        "scale": "3x"
      },
      {
        "size": "40x40",
        "idiom": "iphone",
        "filename": "Icon-40@2x.png",
        "scale": "2x"
      },
      {
        "size": "40x40",
        "idiom": "iphone",
        "filename": "Icon-40@3x.png",
        "scale": "3x"
      },
      {
        "size": "60x60",
        "idiom": "iphone",
        "filename": "Icon-60@2x.png",
        "scale": "2x"
      },
      {
        "size": "60x60",
        "idiom": "iphone",
        "filename": "Icon-60@3x.png",
        "scale": "3x"
      },
      {
        "size": "1024x1024",
        "idiom": "ios-marketing",
        "filename": "Icon-1024.png",
        "scale": "1x"
      }
    ],
    "info": {
      "version": 1,
      "author": "xcode"
    }
  };

  fs.writeFileSync(
    path.join(iosIconDir, 'Contents.json'),
    JSON.stringify(contentsJson, null, 2)
  );

  console.log('Generated iOS Contents.json');
}

async function main() {
  try {
    await generateAndroidIcons();
    await generateIOSIcons();
    console.log('\nAll icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

main();
