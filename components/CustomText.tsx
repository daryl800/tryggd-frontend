// components/CustomText.tsx
import React from 'react';
import { Text as RNText, TextInput as RNTextInput, TextInputProps as RNTextInputProps, TextProps as RNTextProps } from 'react-native';

export function CustomText(props: RNTextProps) {
    return <RNText {...props} allowFontScaling={false} />;
}

export function CustomTextInput(props: RNTextInputProps) {
    return <RNTextInput {...props} allowFontScaling={false} />;
}